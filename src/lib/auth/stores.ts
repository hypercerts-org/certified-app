import type { NodeSavedState, NodeSavedSession } from "@atproto/oauth-client-node"

export class MemoryStateStore {
  private store = new Map<string, { value: NodeSavedState; expiresAt: number }>()
  private readonly ttlMs: number

  constructor(ttlMs: number = 600_000) {
    this.ttlMs = ttlMs
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
