export const sleep = (ts: number) => {
  return new Promise((resolve) => setTimeout(resolve, ts))
}
