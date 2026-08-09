import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mockRoller } from '@jjsk/simulation'
import type { TripSegment } from '../../types'
import { buildTripSegment } from '../buildTripSegment'
import { evaluateExpanded } from '../upperRotation/upperRotation.evaluation'
import { filterPartialSegments } from '../upperRotation/upperRotation.estimate'
import {
  buildUpperRotationNativeDto,
  normalizeUpperRotationNativeSegments,
  type UpperRotationNativeDto,
  type UpperRotationNativeSegment,
} from '../upperRotation/upperRotation.native'

const REPOSITORY_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../..'
)
const DATA_ROOT = resolve(
  REPOSITORY_ROOT,
  'packages/AirRingServer/algorithms/upperRotation/data'
)

export type DatasetName = '01' | '02' | '03' | '04' | '05'

type ThicknessRow = {
  HorizontalPulse: number
  ProbeValue: number
  timestamp: number
} | null

type RotationRow = {
  ForwardRotation: boolean
  ReverseRotation: boolean
  timestamp: number
} | null

export type NormalizedSegment = UpperRotationNativeSegment
export type { UpperRotationNativeDto }

export interface ReferenceSearchResult {
  theta: number
  loss: number
  evaluations: number
  sampleThetas: number[]
  sampleLosses: number[]
}

const readJson = <T>(path: string): T =>
  JSON.parse(readFileSync(path, 'utf8')) as T

export const loadTripSegments = (dataset: DatasetName): TripSegment[] => {
  const datasetRoot = resolve(DATA_ROOT, dataset)
  const thickness = readJson<ThicknessRow[]>(
    resolve(datasetRoot, 'thickness.json')
  )
  const rotation = readJson<RotationRow[]>(resolve(datasetRoot, 'upper.json'))
  const { next: rollerNext } = mockRoller({
    speed: (20 * 1000) / 60,
    RADIUS: 15 * 10,
  })
  const { next } = buildTripSegment()
  let segments: TripSegment[] = []
  for (let index = 0; index < rotation.length; index += 1) {
    const rotationValue = rotation[index]
    const thicknessValue = thickness[index]
    if (!rotationValue || !thicknessValue) continue
    segments = next({
      airRing: rotationValue,
      thickness: { ...rollerNext(), ...thicknessValue },
    })
  }
  return filterPartialSegments(
    segments.filter((segment) => segment.duration > 0)
  )
}

export const normalizeTripSegments = (
  tripSegments: TripSegment[]
): NormalizedSegment[] =>
  normalizeUpperRotationNativeSegments(tripSegments, { filterPartial: false })

export const buildNativeDto = (
  segments: readonly NormalizedSegment[]
): UpperRotationNativeDto => buildUpperRotationNativeDto(segments)

export const searchBestExpandedReference = (
  segments: NormalizedSegment[],
  minDegrees = 180,
  maxDegrees = 360,
  stepDegrees = 1,
  numBins = 36
): ReferenceSearchResult => {
  const starts = Array.from(
    { length: 12 },
    (_, index) => minDegrees + ((maxDegrees - minDegrees) / 12) * index
  )
  const cache = new Map<number, number>()
  let evaluations = 0
  const evaluateTheta = (theta: number) => {
    const key = Math.round(theta * 1000)
    const cached = cache.get(key)
    if (cached !== undefined) return cached
    evaluations += 1
    const loss = evaluateExpanded(segments, theta, numBins)
    cache.set(key, loss)
    return loss
  }

  let bestTheta: number | null = null
  let bestLoss = Infinity
  const sampleThetas: number[] = []
  const sampleLosses: number[] = []
  const rangeSize = (maxDegrees - minDegrees) / 12
  for (const start of starts) {
    const searchEnd = Math.min(maxDegrees, start + rangeSize + 10)
    for (let theta = start; theta < searchEnd; theta += stepDegrees) {
      const loss = evaluateTheta(theta)
      sampleThetas.push(theta)
      sampleLosses.push(loss)
      if (loss < bestLoss) {
        bestLoss = loss
        bestTheta = theta
      }
    }
  }
  if (bestTheta === null) throw new Error('TypeScript 参考搜索未找到最优点')

  const fineMin = Math.max(minDegrees, bestTheta - 5)
  const fineMax = Math.min(maxDegrees, bestTheta + 5)
  const fineStep = Math.min(0.1, stepDegrees)
  for (let theta = fineMin; theta <= fineMax; theta += fineStep) {
    const loss = evaluateTheta(theta)
    if (loss < bestLoss) {
      bestLoss = loss
      bestTheta = theta
    }
  }
  return {
    theta: bestTheta,
    loss: bestLoss,
    evaluations,
    sampleThetas,
    sampleLosses,
  }
}
