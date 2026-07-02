export function bridgeShortGaps(
  data: readonly [number, number | null][]
): [number, number | null][]
export function bridgeShortGaps(
  profile: readonly (number | null)[],
  maxGapBins: number
): Array<number | null>
export function bridgeShortGaps(
  data: readonly (number | null)[] | readonly [number, number | null][],
  maxGapBins = 3
): Array<number | null> | [number, number | null][] {
  const isTupleData = Array.isArray(data[0])
  const profile = isTupleData
    ? (data as readonly [number, number | null][]).map((point) => point[1])
    : (data as readonly (number | null)[])

  const n = profile.length
  if (n === 0 || maxGapBins <= 0) return [...data] as Array<number | null> | [number, number | null][]

  const out = [...profile]
  const anchor = out.findIndex((value) => value != null)
  if (anchor < 0) return isTupleData ? restoreTupleData(data, out) : out

  let idx = (anchor + 1) % n
  while (idx !== anchor) {
    if (out[idx] != null) {
      idx = (idx + 1) % n
      continue
    }

    const start = idx
    let len = 0
    while (out[idx] == null) {
      len += 1
      idx = (idx + 1) % n
      if (idx === anchor) break
    }

    const prevIdx = (start - 1 + n) % n
    const nextIdx = idx
    const prevVal = out[prevIdx]
    const nextVal = out[nextIdx]

    if (len <= maxGapBins && prevVal != null && nextVal != null) {
      for (let k = 1; k <= len; k++) {
        const t = k / (len + 1)
        out[(prevIdx + k) % n] = prevVal * (1 - t) + nextVal * t
      }
    }

    if (idx === anchor) break
  }

  return isTupleData ? restoreTupleData(data, out) : out
}

const restoreTupleData = (
  data: readonly (number | null)[] | readonly [number, number | null][],
  values: readonly (number | null)[]
): [number, number | null][] =>
  (data as readonly [number, number | null][]).map((point, index) => [
    point[0],
    values[index] ?? null,
  ])
