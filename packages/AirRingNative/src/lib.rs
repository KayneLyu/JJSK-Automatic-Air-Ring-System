use std::{
    collections::{HashMap, HashSet},
    f64::consts::{PI, TAU},
    sync::OnceLock,
};

use napi::{bindgen_prelude::*, Error, Status};
use napi_derive::napi;
use rayon::prelude::*;
use rayon::ThreadPoolBuilder;

const NUM_STARTS: usize = 12;
const MAX_NUM_BINS: usize = 65_536;
const MAX_BUBBLE_BINS: usize = 2_048;
const MAX_BUBBLE_MEASUREMENTS: usize = 1_000_000;
const MAX_BUBBLE_NON_ZERO: usize = 4_000_000;
const BUBBLE_ZERO: f64 = 1e-14;
const MAX_THREAD_COUNT: u32 = 32;
static CONFIGURED_THREAD_COUNT: OnceLock<u32> = OnceLock::new();

#[derive(Clone, Copy)]
enum Objective {
    Direct,
    Expanded,
}

struct SegmentedInput<'a> {
    times: &'a [f64],
    values: &'a [f64],
    offset_degrees: &'a [f64],
    segment_offsets: &'a [u32],
    durations: &'a [f64],
    accel_ratios: &'a [f64],
    num_bins: usize,
}

struct EvaluationScratch {
    counts: Vec<u32>,
    means: Vec<f64>,
    m2: Vec<f64>,
}

impl EvaluationScratch {
    fn new(num_bins: usize) -> Self {
        Self {
            counts: vec![0; num_bins],
            means: vec![0.0; num_bins],
            m2: vec![0.0; num_bins],
        }
    }

    fn reset(&mut self) {
        self.counts.fill(0);
        self.means.fill(0.0);
        self.m2.fill(0.0);
    }
}

#[napi(object)]
pub struct NativeSearchResult {
    pub theta: f64,
    pub loss: f64,
    pub evaluations: u32,
    pub sample_thetas: Vec<f64>,
    pub sample_losses: Vec<f64>,
}

#[napi]
pub fn configure_thread_pool(max_threads: u32) -> Result<u32> {
    if !(1..=MAX_THREAD_COUNT).contains(&max_threads) {
        return Err(invalid_arg("maxThreads 必须在 1..=32 范围内"));
    }

    match CONFIGURED_THREAD_COUNT.set(max_threads) {
        Ok(()) => Ok(max_threads),
        Err(_) if CONFIGURED_THREAD_COUNT.get() == Some(&max_threads) => Ok(max_threads),
        Err(_) => Err(invalid_arg("Native 搜索线程数已使用不同的值完成配置")),
    }
}

#[allow(clippy::too_many_arguments)]
fn validate_input<'a>(
    times: &'a [f64],
    values: &'a [f64],
    offset_degrees: &'a [f64],
    segment_offsets: &'a [u32],
    durations: &'a [f64],
    accel_ratios: &'a [f64],
    num_bins: u32,
) -> Result<SegmentedInput<'a>> {
    if times.len() != values.len() || times.len() != offset_degrees.len() {
        return Err(invalid_arg("times、values 与 offsetDegrees 的长度必须一致"));
    }
    if durations.len() != accel_ratios.len() {
        return Err(invalid_arg("durations 与 accelRatios 的长度必须一致"));
    }
    if segment_offsets.len() != durations.len() + 1 {
        return Err(invalid_arg("segmentOffsets 长度必须等于 segment 数量加一"));
    }
    if segment_offsets.first().copied() != Some(0) {
        return Err(invalid_arg("segmentOffsets 必须从 0 开始"));
    }
    if segment_offsets.last().copied().map(|value| value as usize) != Some(times.len()) {
        return Err(invalid_arg("segmentOffsets 的最后一项必须等于点数"));
    }
    if segment_offsets
        .windows(2)
        .any(|window| window[0] > window[1])
    {
        return Err(invalid_arg("segmentOffsets 必须单调不减"));
    }

    let num_bins = num_bins as usize;
    if !(2..=MAX_NUM_BINS).contains(&num_bins) {
        return Err(invalid_arg("numBins 必须在 2..=65536 范围内"));
    }
    if times.iter().any(|value| !value.is_finite()) {
        return Err(invalid_arg("times 只能包含有限数值"));
    }
    if values.iter().any(|value| value.is_infinite()) {
        return Err(invalid_arg("values 不能包含正负无穷；缺测请使用 NaN"));
    }
    if offset_degrees.iter().any(|value| !value.is_finite()) {
        return Err(invalid_arg("offsetDegrees 只能包含有限数值"));
    }
    if durations
        .iter()
        .any(|duration| !duration.is_finite() || *duration <= 0.0)
    {
        return Err(invalid_arg("durations 必须为有限正数"));
    }
    if accel_ratios
        .iter()
        .any(|ratio| !ratio.is_finite() || !(0.0..=0.49).contains(ratio))
    {
        return Err(invalid_arg("accelRatios 必须在 0..=0.49 范围内"));
    }

    Ok(SegmentedInput {
        times,
        values,
        offset_degrees,
        segment_offsets,
        durations,
        accel_ratios,
        num_bins,
    })
}

fn invalid_arg(message: &str) -> Error {
    Error::new(Status::InvalidArg, message.to_owned())
}

fn trapezoidal_position(progress: f64, accel_ratio: f64) -> f64 {
    let safe_progress = progress.clamp(0.0, 1.0);
    let norm_factor = 1.0 / (1.0 - accel_ratio);
    let raw = if accel_ratio > 0.0 && safe_progress < accel_ratio {
        0.5 * (safe_progress / accel_ratio).powi(2) * accel_ratio
    } else if accel_ratio > 0.0 && safe_progress > 1.0 - accel_ratio {
        let local_progress = (safe_progress - (1.0 - accel_ratio)) / accel_ratio;
        0.5 * accel_ratio
            + (1.0 - 2.0 * accel_ratio)
            + (local_progress - 0.5 * local_progress * local_progress) * accel_ratio
    } else {
        0.5 * accel_ratio + (safe_progress - accel_ratio)
    };
    raw * norm_factor
}

fn evaluate(
    input: &SegmentedInput<'_>,
    theta_max_degrees: f64,
    objective: Objective,
    scratch: &mut EvaluationScratch,
) -> f64 {
    if !theta_max_degrees.is_finite() || input.durations.is_empty() {
        return f64::INFINITY;
    }

    scratch.reset();
    let bin_width = TAU / input.num_bins as f64;
    let theta_max_radians = theta_max_degrees * PI / 180.0;
    let mut total_y = 0.0;
    let mut total_y_squared = 0.0;
    let mut total_count = 0_u64;

    for segment_index in 0..input.durations.len() {
        let start = input.segment_offsets[segment_index] as usize;
        let end = input.segment_offsets[segment_index + 1] as usize;
        let duration = input.durations[segment_index];
        let accel_ratio = input.accel_ratios[segment_index];

        for point_index in start..end {
            let value = input.values[point_index];
            if value.is_nan() {
                continue;
            }

            let mut phi = trapezoidal_position(input.times[point_index] / duration, accel_ratio)
                * theta_max_radians;
            if matches!(objective, Objective::Expanded) {
                phi += input.offset_degrees[point_index] * PI / 180.0;
            }
            let normalized = ((phi % TAU) + TAU) % TAU;
            let bin_index = ((normalized / bin_width).floor() as usize) % input.num_bins;

            scratch.counts[bin_index] += 1;
            let count = scratch.counts[bin_index] as f64;
            let delta = value - scratch.means[bin_index];
            scratch.means[bin_index] += delta / count;
            scratch.m2[bin_index] += delta * (value - scratch.means[bin_index]);

            total_y += value;
            total_y_squared += value * value;
            total_count += 1;
        }
    }

    let mut total_variance = 0.0;
    let mut valid_bin_count = 0_u64;
    for bin_index in 0..input.num_bins {
        let count = scratch.counts[bin_index];
        if count < 2 {
            continue;
        }
        total_variance += scratch.m2[bin_index] / count as f64;
        valid_bin_count += 1;
    }

    if valid_bin_count == 0 || total_count < 2 {
        return f64::INFINITY;
    }

    let total_count_f64 = total_count as f64;
    let global_variance = total_y_squared / total_count_f64 - (total_y / total_count_f64).powi(2);
    if global_variance > 1.0 {
        total_variance / (valid_bin_count as f64 * global_variance)
    } else {
        total_variance / valid_bin_count as f64
    }
}

#[allow(clippy::too_many_arguments)]
#[napi]
pub fn evaluate_direct(
    times: &[f64],
    values: &[f64],
    offset_degrees: &[f64],
    segment_offsets: &[u32],
    durations: &[f64],
    accel_ratios: &[f64],
    theta_max_degrees: f64,
    num_bins: u32,
) -> Result<f64> {
    let input = validate_input(
        times,
        values,
        offset_degrees,
        segment_offsets,
        durations,
        accel_ratios,
        num_bins,
    )?;
    let mut scratch = EvaluationScratch::new(input.num_bins);
    Ok(evaluate(
        &input,
        theta_max_degrees,
        Objective::Direct,
        &mut scratch,
    ))
}

#[allow(clippy::too_many_arguments)]
#[napi]
pub fn evaluate_expanded(
    times: &[f64],
    values: &[f64],
    offset_degrees: &[f64],
    segment_offsets: &[u32],
    durations: &[f64],
    accel_ratios: &[f64],
    theta_max_degrees: f64,
    num_bins: u32,
) -> Result<f64> {
    let input = validate_input(
        times,
        values,
        offset_degrees,
        segment_offsets,
        durations,
        accel_ratios,
        num_bins,
    )?;
    let mut scratch = EvaluationScratch::new(input.num_bins);
    Ok(evaluate(
        &input,
        theta_max_degrees,
        Objective::Expanded,
        &mut scratch,
    ))
}

#[allow(clippy::too_many_arguments)]
fn search_best_in_pool(
    input: &SegmentedInput<'_>,
    min_degrees: f64,
    max_degrees: f64,
    step_degrees: f64,
    objective: Objective,
) -> Result<NativeSearchResult> {
    if !min_degrees.is_finite()
        || !max_degrees.is_finite()
        || !step_degrees.is_finite()
        || min_degrees >= max_degrees
        || step_degrees <= 0.0
    {
        return Err(invalid_arg(
            "搜索范围必须有限，且满足 minDegrees < maxDegrees、stepDegrees > 0",
        ));
    }

    let mut best_theta = None;
    let mut best_loss = f64::INFINITY;
    let range_size = (max_degrees - min_degrees) / NUM_STARTS as f64;
    let mut loss_cache = HashMap::<i64, f64>::new();
    let mut seen_keys = HashSet::<i64>::new();
    let mut coarse_candidates = Vec::<f64>::new();
    let mut coarse_sequence = Vec::<f64>::new();

    for start_index in 0..NUM_STARTS {
        let start = min_degrees + range_size * start_index as f64;
        let search_end = max_degrees.min(start + range_size + 10.0);
        let mut theta = start;
        while theta < search_end {
            coarse_sequence.push(theta);
            let cache_key = (theta * 1000.0).round() as i64;
            if seen_keys.insert(cache_key) {
                coarse_candidates.push(theta);
            }
            theta += step_degrees;
        }
    }

    let coarse_losses: Vec<f64> = coarse_candidates
        .par_iter()
        .map_init(
            || EvaluationScratch::new(input.num_bins),
            |scratch, theta| evaluate(input, *theta, objective, scratch),
        )
        .collect();
    for (theta, loss) in coarse_candidates.into_iter().zip(coarse_losses) {
        loss_cache.insert((theta * 1000.0).round() as i64, loss);
        if loss < best_loss {
            best_loss = loss;
            best_theta = Some(theta);
        }
    }

    let sample_losses = coarse_sequence
        .iter()
        .map(|theta| {
            let cache_key = (*theta * 1000.0).round() as i64;
            *loss_cache
                .get(&cache_key)
                .expect("coarse candidate loss must be cached")
        })
        .collect();

    let mut best_theta = best_theta.ok_or_else(|| invalid_arg("搜索未找到有限最优点"))?;
    let fine_min = min_degrees.max(best_theta - 5.0);
    let fine_max = max_degrees.min(best_theta + 5.0);
    let fine_step = 0.1_f64.min(step_degrees);
    let mut fine_candidates = Vec::<f64>::new();
    let mut fine_new_candidates = Vec::<f64>::new();
    let mut theta = fine_min;
    while theta <= fine_max {
        fine_candidates.push(theta);
        let cache_key = (theta * 1000.0).round() as i64;
        if seen_keys.insert(cache_key) {
            fine_new_candidates.push(theta);
        }
        theta += fine_step;
    }
    let fine_new_losses: Vec<f64> = fine_new_candidates
        .par_iter()
        .map_init(
            || EvaluationScratch::new(input.num_bins),
            |scratch, theta| evaluate(input, *theta, objective, scratch),
        )
        .collect();
    for (theta, loss) in fine_new_candidates.into_iter().zip(fine_new_losses) {
        loss_cache.insert((theta * 1000.0).round() as i64, loss);
    }
    for theta in fine_candidates {
        let cache_key = (theta * 1000.0).round() as i64;
        let loss = *loss_cache
            .get(&cache_key)
            .expect("fine candidate loss must be cached");
        if loss < best_loss {
            best_loss = loss;
            best_theta = theta;
        }
    }

    Ok(NativeSearchResult {
        theta: best_theta,
        loss: best_loss,
        evaluations: loss_cache.len().min(u32::MAX as usize) as u32,
        sample_thetas: coarse_sequence,
        sample_losses,
    })
}

fn search_best(
    input: &SegmentedInput<'_>,
    min_degrees: f64,
    max_degrees: f64,
    step_degrees: f64,
    objective: Objective,
) -> Result<NativeSearchResult> {
    let thread_count = CONFIGURED_THREAD_COUNT
        .get()
        .copied()
        .map(|count| count as usize)
        .unwrap_or_else(|| {
            std::thread::available_parallelism()
                .map(|count| count.get())
                .unwrap_or(1)
                .min(MAX_THREAD_COUNT as usize)
        });
    let pool = ThreadPoolBuilder::new()
        .num_threads(thread_count)
        .thread_name(|index| format!("air-ring-native-{index}"))
        .build()
        .map_err(|error| {
            Error::new(
                Status::GenericFailure,
                format!("Native 局部线程池创建失败: {error}"),
            )
        })?;
    pool.install(|| search_best_in_pool(input, min_degrees, max_degrees, step_degrees, objective))
}

#[allow(clippy::too_many_arguments)]
#[napi]
pub fn search_best_direct(
    times: &[f64],
    values: &[f64],
    offset_degrees: &[f64],
    segment_offsets: &[u32],
    durations: &[f64],
    accel_ratios: &[f64],
    min_degrees: f64,
    max_degrees: f64,
    step_degrees: f64,
    num_bins: u32,
) -> Result<NativeSearchResult> {
    let input = validate_input(
        times,
        values,
        offset_degrees,
        segment_offsets,
        durations,
        accel_ratios,
        num_bins,
    )?;
    search_best(
        &input,
        min_degrees,
        max_degrees,
        step_degrees,
        Objective::Direct,
    )
}

#[allow(clippy::too_many_arguments)]
#[napi]
pub fn search_best_expanded(
    times: &[f64],
    values: &[f64],
    offset_degrees: &[f64],
    segment_offsets: &[u32],
    durations: &[f64],
    accel_ratios: &[f64],
    min_degrees: f64,
    max_degrees: f64,
    step_degrees: f64,
    num_bins: u32,
) -> Result<NativeSearchResult> {
    let input = validate_input(
        times,
        values,
        offset_degrees,
        segment_offsets,
        durations,
        accel_ratios,
        num_bins,
    )?;
    search_best(
        &input,
        min_degrees,
        max_degrees,
        step_degrees,
        Objective::Expanded,
    )
}

struct BubbleSparseInput<'a> {
    measurements: usize,
    bins: usize,
    row_ptr: &'a [i32],
    col_ind: &'a [i32],
    values: &'a [f64],
    targets: &'a [f64],
}

fn validate_bubble_sparse_input<'a>(
    row_ptr: &'a [i32],
    col_ind: &'a [i32],
    values: &'a [f64],
    targets: &'a [f64],
    num_bins: u32,
    lambda: f64,
    mu: f64,
) -> Result<BubbleSparseInput<'a>> {
    let measurements = targets.len();
    let bins = num_bins as usize;
    if !(2..=MAX_BUBBLE_BINS).contains(&bins) {
        return Err(invalid_arg("膜泡 numBins 必须在 2..=2048 范围内"));
    }
    if measurements == 0 || measurements > MAX_BUBBLE_MEASUREMENTS {
        return Err(invalid_arg("膜泡测量数必须在 1..=1000000 范围内"));
    }
    if row_ptr.len() != measurements + 1 {
        return Err(invalid_arg("rowPtr 长度必须等于测量数加一"));
    }
    if col_ind.len() != values.len() || values.len() > MAX_BUBBLE_NON_ZERO {
        return Err(invalid_arg(
            "colInd 与 values 长度必须一致，且非零元不超过 4000000",
        ));
    }
    if row_ptr.first().copied() != Some(0) {
        return Err(invalid_arg("rowPtr 必须从 0 开始"));
    }
    if row_ptr
        .windows(2)
        .any(|window| window[0] < 0 || window[0] > window[1])
    {
        return Err(invalid_arg("rowPtr 必须为非负且单调不减"));
    }
    if row_ptr.last().copied().map(|value| value as usize) != Some(values.len()) {
        return Err(invalid_arg("rowPtr 最后一项必须等于非零元数量"));
    }
    if col_ind
        .iter()
        .any(|column| *column < 0 || *column as usize >= bins)
    {
        return Err(invalid_arg("colInd 包含越界列索引"));
    }
    if values.iter().any(|value| !value.is_finite())
        || targets.iter().any(|value| !value.is_finite())
    {
        return Err(invalid_arg("values 与 targets 只能包含有限数值"));
    }
    if !lambda.is_finite() || lambda < 0.0 || !mu.is_finite() || mu < 0.0 {
        return Err(invalid_arg("lambda 与 mu 必须为有限非负数"));
    }
    bins.checked_mul(bins)
        .ok_or_else(|| invalid_arg("numBins 导致矩阵大小溢出"))?;

    Ok(BubbleSparseInput {
        measurements,
        bins,
        row_ptr,
        col_ind,
        values,
        targets,
    })
}

fn wrap_bubble_index(index: isize, bins: usize) -> usize {
    index.rem_euclid(bins as isize) as usize
}

fn build_bubble_normal_equations(
    input: &BubbleSparseInput<'_>,
    lambda: f64,
    mu: f64,
) -> (Vec<f64>, Vec<f64>) {
    let mut lhs = vec![0.0; input.bins * input.bins];
    let mut rhs = vec![0.0; input.bins];

    for row in 0..input.measurements {
        let start = input.row_ptr[row] as usize;
        let end = input.row_ptr[row + 1] as usize;
        for p in start..end {
            let column_p = input.col_ind[p] as usize;
            let value_p = input.values[p];
            rhs[column_p] += value_p * input.targets[row];
            for q in p..end {
                let column_q = input.col_ind[q] as usize;
                let value = value_p * input.values[q];
                lhs[column_p * input.bins + column_q] += value;
                if column_p != column_q {
                    lhs[column_q * input.bins + column_p] += value;
                }
            }
        }
    }

    for index in 0..input.bins {
        lhs[index * input.bins + index] += lambda;
    }

    if mu > BUBBLE_ZERO {
        const OFFSETS_AND_WEIGHTS: [(isize, f64); 9] = [
            (0, 70.0),
            (1, -56.0),
            (-1, -56.0),
            (2, 28.0),
            (-2, 28.0),
            (3, -8.0),
            (-3, -8.0),
            (4, 1.0),
            (-4, 1.0),
        ];
        for row in 0..input.bins {
            for (offset, weight) in OFFSETS_AND_WEIGHTS {
                let column = wrap_bubble_index(row as isize + offset, input.bins);
                lhs[row * input.bins + column] += mu * weight;
            }
        }
    }

    (lhs, rhs)
}

fn solve_bubble_cholesky(lhs: &[f64], rhs: &[f64], bins: usize) -> Result<Vec<f64>> {
    let mut lower = vec![0.0; bins * bins];
    for row in 0..bins {
        for column in 0..=row {
            let mut sum = lhs[row * bins + column];
            for inner in 0..column {
                sum -= lower[row * bins + inner] * lower[column * bins + inner];
            }
            if row == column {
                lower[row * bins + row] = sum.max(BUBBLE_ZERO).sqrt();
            } else {
                lower[row * bins + column] = sum / lower[column * bins + column].max(BUBBLE_ZERO);
            }
        }
    }

    let mut intermediate = vec![0.0; bins];
    for row in 0..bins {
        let mut sum = rhs[row];
        for column in 0..row {
            sum -= lower[row * bins + column] * intermediate[column];
        }
        intermediate[row] = sum / lower[row * bins + row].max(BUBBLE_ZERO);
    }

    let mut result = vec![0.0; bins];
    for row in (0..bins).rev() {
        let mut sum = intermediate[row];
        for column in row + 1..bins {
            sum -= lower[column * bins + row] * result[column];
        }
        let value = sum / lower[row * bins + row].max(BUBBLE_ZERO);
        if !value.is_finite() {
            return Err(Error::new(
                Status::GenericFailure,
                "膜泡 Cholesky 求解产生非有限结果".to_owned(),
            ));
        }
        // 保持完整的无约束解参与剩余回代；若在这里提前截断负值，
        // 会改变更低索引分量的方程，病态历史矩阵上可产生微米级偏差。
        result[row] = value;
    }

    for value in &mut result {
        *value = value.max(0.0);
    }

    Ok(result)
}

#[allow(clippy::too_many_arguments)]
#[napi]
pub fn solve_bubble_batch(
    row_ptr: &[i32],
    col_ind: &[i32],
    values: &[f64],
    targets: &[f64],
    num_bins: u32,
    lambda: f64,
    mu: f64,
) -> Result<Vec<f64>> {
    let input =
        validate_bubble_sparse_input(row_ptr, col_ind, values, targets, num_bins, lambda, mu)?;
    let (lhs, rhs) = build_bubble_normal_equations(&input, lambda, mu);
    solve_bubble_cholesky(&lhs, &rhs, input.bins)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trapezoidal_position_matches_endpoints() {
        assert_eq!(trapezoidal_position(0.0, 0.1), 0.0);
        assert!((trapezoidal_position(1.0, 0.1) - 1.0).abs() < 1e-12);
        assert!((trapezoidal_position(0.5, 0.1) - 0.5).abs() < 1e-12);
    }

    #[test]
    fn validates_segment_offsets() {
        let result = validate_input(&[0.0], &[1.0], &[0.0], &[0, 0], &[1.0], &[0.1], 48);
        assert!(result.is_err());
    }

    #[test]
    fn validates_thread_pool_limit() {
        assert!(configure_thread_pool(0).is_err());
        assert!(configure_thread_pool(MAX_THREAD_COUNT + 1).is_err());
    }

    #[test]
    fn configures_thread_pool_once_under_concurrency() {
        let handles: Vec<_> = (0..4)
            .map(|_| std::thread::spawn(|| configure_thread_pool(2)))
            .collect();
        for handle in handles {
            assert_eq!(
                handle
                    .join()
                    .expect("configuration thread panicked")
                    .unwrap(),
                2
            );
        }
        assert_eq!(configure_thread_pool(2).unwrap(), 2);
        assert!(configure_thread_pool(3).is_err());
    }

    #[test]
    fn search_returns_ordered_coarse_samples() {
        let times = [0.0, 0.5, 1.0, 0.0, 0.5, 1.0];
        let values = [1.0, 2.0, 1.0, 1.5, 2.5, 1.5];
        let offsets = [0.0; 6];
        let segment_offsets = [0, 3, 6];
        let durations = [1.0, 1.0];
        let accel_ratios = [0.0, 0.0];
        let input = validate_input(
            &times,
            &values,
            &offsets,
            &segment_offsets,
            &durations,
            &accel_ratios,
            4,
        )
        .unwrap();
        let result = search_best_in_pool(&input, 180.0, 360.0, 10.0, Objective::Direct)
            .expect("search should succeed");

        assert_eq!(result.sample_thetas.len(), result.sample_losses.len());
        assert!(!result.sample_thetas.is_empty());
        assert_eq!(result.sample_thetas[0], 180.0);
    }

    #[test]
    fn bubble_batch_solves_regularized_diagonal_system() {
        let result = solve_bubble_batch(
            &[0, 1, 2, 3, 4],
            &[0, 1, 2, 3],
            &[1.0, 1.0, 1.0, 1.0],
            &[1.0, 2.0, 3.0, 4.0],
            4,
            1.0,
            0.0,
        )
        .expect("bubble batch solve should succeed");

        assert_eq!(result.len(), 4);
        for (actual, expected) in result.iter().zip([0.5, 1.0, 1.5, 2.0]) {
            assert!((actual - expected).abs() < 1e-12);
        }
    }

    #[test]
    fn bubble_batch_rejects_invalid_csr() {
        let result = solve_bubble_batch(&[0, 2], &[0], &[1.0], &[1.0], 4, 1e-4, 0.0);
        assert!(result.is_err());
    }

    #[test]
    fn bubble_cholesky_clamps_only_after_back_substitution() {
        // 无约束解为 [1, -1]。若在回代过程中提前把 x[1] 截断为 0，
        // x[0] 会被错误改写为 0.5；正确流程应先完成回代再得到 [1, 0]。
        let result = solve_bubble_cholesky(&[2.0, 1.0, 1.0, 2.0], &[1.0, -1.0], 2)
            .expect("cholesky should succeed");

        assert!((result[0] - 1.0).abs() < 1e-12);
        assert_eq!(result[1], 0.0);
    }
}
