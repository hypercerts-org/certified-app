import type { NodeSavedState, NodeSavedSession } from "@atproto/oauth-client-node"

export class MemoryStateStore {
  private store = new Map<string, { value: NodeSavedState; expiresAt: number }>()
  private readonly ttlMs: number
  private cleanupInterval: ReturnType<typeof setInterval>

  constructor(ttlMs: number = 600_000) {
    this.ttlMs = ttlMs
    // Sweep expired entries every 60 seconds
    this.cleanupInterval = setInterval(() => this.sweep(), 60_000)
    // Don't block process exit
    if (this.cleanupInterval.unref) this.cleanupInterval.unref()
  }

  private sweep(): void {
    const now = Date.now()
    for (const [key, entry] of this.store) {
      if (now >= entry.expiresAt) {
        this.store.delete(key)
      }
    }
  }

  async set(key: string, value: NodeSavedState): Promise<void> {
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs })
  }

  async get(key: string): Promise<NodeSavedState | undefined> {
    const entry = this.store.get(key)
    if (!entry) return undefined
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key)
      return undefined
    }
    return entry.value
  }

  async del(key: string): Promise<void> {
    this.store.delete(key)
  }
}

export class MemorySessionStore {
  private store = new Map<string, NodeSavedSession>()

  async set(key: string, value: NodeSavedSession): Promise<void> {
    this.store.set(key, value)
  }

  async get(key: string): Promise<NodeSavedSession | undefined> {
    return this.store.get(key)
  }

  async del(key: string): Promise<void> {
    this.store.delete(key)
  }
}
