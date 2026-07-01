export function createBoundedCache<K, V>(maxSize = 500): Map<K, V> {
  const map = new Map<K, V>()
  const originalSet = map.set.bind(map)
  map.set = (key: K, value: V) => {
    if (map.size >= maxSize && !map.has(key)) {
      const firstKey = map.keys().next().value
      if (firstKey !== undefined) map.delete(firstKey)
    }
    return originalSet(key, value)
  }
  return map
}
