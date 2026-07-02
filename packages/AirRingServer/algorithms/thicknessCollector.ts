export interface ThicknessCollectorPoint {
  readonly pulse: number
  readonly ad: number | null
}

export type ThicknessCollectorPreviewPoint = readonly [number, number]

export interface ThicknessCollector {
  readonly process: (
    pulses: readonly number[],
    adValues: readonly number[]
  ) => ThicknessCollectorPoint[] | null
  readonly getPreviewData: () => ThicknessCollectorPreviewPoint[]
}

export const createThicknessCollector = (maxPulse = 7000): ThicknessCollector => {
  const pulseMap = new Map<number, number>()

  let lastPulse: number | null = null
  let direction: -1 | 1 | null = null

  const boundaryHigh = maxPulse * 0.97
  const boundaryLow = maxPulse * 0.03

  const buildFullData = (): ThicknessCollectorPoint[] => {
    const result: ThicknessCollectorPoint[] = []
    let lastValue: number | null = null

    for (let pulse = 0; pulse <= maxPulse; pulse++) {
      if (pulseMap.has(pulse)) {
        lastValue = pulseMap.get(pulse) ?? null
      }
      result.push({ pulse, ad: lastValue })
    }

    return result
  }

  const process = (
    pulses: readonly number[],
    adValues: readonly number[]
  ): ThicknessCollectorPoint[] | null => {
    let completedData: ThicknessCollectorPoint[] | null = null

    for (let index = 0; index < pulses.length; index++) {
      const pulse = pulses[index]
      const ad = adValues[index]
      if (pulse === undefined || ad === undefined) continue

      if (pulse < 0 || pulse > maxPulse) continue

      if (lastPulse !== null) {
        const delta = pulse - lastPulse

        let newDirection = direction

        if (delta > 0) newDirection = 1
        else if (delta < 0) newDirection = -1

        if (direction === 1 && pulse > boundaryHigh && newDirection === -1) {
          if (pulseMap.size > 500) {
            completedData = buildFullData()
          }
          pulseMap.clear()
        }

        if (direction === -1 && pulse < boundaryLow && newDirection === 1) {
          if (pulseMap.size > 500) {
            completedData = buildFullData()
          }
          pulseMap.clear()
        }

        direction = newDirection
      }

      pulseMap.set(pulse, ad)
      lastPulse = pulse
    }

    return completedData
  }

  const getPreviewData = (): ThicknessCollectorPreviewPoint[] => {
    const arr: ThicknessCollectorPreviewPoint[] = []
    for (const [pulse, ad] of pulseMap) {
      arr.push([pulse, ad])
    }
    arr.sort((a, b) => a[0] - b[0])
    return arr
  }

  return {
    process,
    getPreviewData,
  }
}
