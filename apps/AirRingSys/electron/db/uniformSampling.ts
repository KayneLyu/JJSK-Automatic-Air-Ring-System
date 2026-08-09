/**
 * 从已排序的迭代器中按与 downsampleUniform 相同的索引规则采样。
 *
 * 调用方必须在同一只读事务中先取得 sourceCount 再创建迭代器，避免实时写入
 * 导致 COUNT 与迭代快照不一致。函数最多保留 target 个对象，不物化完整结果集。
 */
export const collectUniformSample = <T>(
  orderedValues: Iterable<T>,
  sourceCount: number,
  target: number
): T[] => {
  if (!Number.isSafeInteger(sourceCount) || sourceCount < 0) {
    throw new Error('sourceCount 必须是非负安全整数')
  }
  if (!Number.isSafeInteger(target) || target <= 0) {
    throw new Error('target 必须是正安全整数')
  }

  const expectedCount = Math.min(sourceCount, target)
  const result: T[] = []
  const stride = sourceCount > target ? sourceCount / target : 1
  let nextSourceIndex = 0
  let sourceIndex = 0

  for (const value of orderedValues) {
    if (sourceIndex === nextSourceIndex) {
      result.push(value)
      if (result.length === expectedCount) break
      nextSourceIndex =
        sourceCount > target
          ? Math.floor(result.length * stride)
          : result.length
    }
    sourceIndex += 1
  }

  if (result.length !== expectedCount) {
    throw new Error(
      `有序查询数量与 COUNT 不一致: expected=${expectedCount}, actual=${result.length}`
    )
  }
  return result
}
