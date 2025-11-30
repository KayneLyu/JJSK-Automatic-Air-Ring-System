/**
 * 黄金分割搜索：在 [a, b] 上最小化 f(x)
 */
export const goldenSectionSearch = (
  f: (x: number) => number,
  a: number,
  b: number,
  tol: number = 0.1 // 0.1° tolerance
): number => {
  const gr = (1 + Math.sqrt(5)) / 2 // golden ratio
  let c = b - (b - a) / gr
  let d = a + (b - a) / gr
  let fc = f(c)
  let fd = f(d)

  while (Math.abs(b - a) > tol) {
    if (fc < fd) {
      b = d
      d = c
      fd = fc
      c = b - (b - a) / gr
      fc = f(c)
    } else {
      a = c
      c = d
      fc = fd
      d = a + (b - a) / gr
      fd = f(d)
    }
  }
  return (b + a) / 2
}
