export const PACKAGED_RUST_RUNTIME_DEFAULTS = {
  AIR_RING_RUST_PRIMARY: '1',
  AIR_RING_RUST_PRIMARY_THREADS: '4',
  AIR_RING_BUBBLE_RUST_PRIMARY: '1',
} as const

export const applyPackagedRuntimeDefaults = (
  isPackaged: boolean,
  environment: NodeJS.ProcessEnv
): NodeJS.ProcessEnv => {
  if (!isPackaged) return environment

  for (const [name, value] of Object.entries(PACKAGED_RUST_RUNTIME_DEFAULTS)) {
    environment[name] ??= value
  }
  return environment
}
