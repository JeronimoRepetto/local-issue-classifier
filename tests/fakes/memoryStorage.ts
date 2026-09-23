// In-memory Web Storage fake. `quotaBytes` makes setItem throw a
// QuotaExceededError once the UTF-16 size of all entries would exceed it.
export class MemoryStorage implements Storage {
  private map = new Map<string, string>()
  quotaBytes = Infinity
  setCalls = 0

  get length(): number {
    return this.map.size
  }

  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null
  }

  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null
  }

  setItem(key: string, value: string): void {
    this.setCalls++
    const next = new Map(this.map)
    next.set(key, String(value))
    let bytes = 0
    for (const [k, v] of next) bytes += (k.length + v.length) * 2
    if (bytes > this.quotaBytes) {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
    }
    this.map = next
  }

  removeItem(key: string): void {
    this.map.delete(key)
  }

  clear(): void {
    this.map.clear()
  }

  keys(): string[] {
    return [...this.map.keys()]
  }
}
