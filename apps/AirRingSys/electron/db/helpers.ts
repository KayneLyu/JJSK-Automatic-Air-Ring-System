export function buildSweepDataList(
  pulses: number[],
  adValues: number[]
): number[] {
  const pulseMap = new Map<number, number>()
  for (let i = 0; i < pulses.length; i++) {
    pulseMap.set(pulses[i], adValues[i])
  }
  const result: number[] = []
  let lastValue: number | null = null
  for (let i = 0; i < 7000; i++) {
    if (pulseMap.has(i)) lastValue = pulseMap.get(i)!
    result.push(lastValue ?? 0)
  }
  return result
}

export function calcThicknessClient(
  ad: number,
  airAD: number,
  gain: number
): number {
  if (ad <= 0 || ad >= airAD) return 0
  const x = Math.log(airAD / ad)
  const base = 9.65 * x * x + 243.08 * x - 0.087
  return Math.max(0, base * gain)
}
