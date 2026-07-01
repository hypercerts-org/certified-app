// jsdom does not implement window.matchMedia. Stub it so hooks that
// call matchMedia in effects (e.g. useLayoutBreakpoints) don't throw.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
})

// Node 21+ exposes a native global `localStorage` (Web Storage, behind
// `--localstorage-file`). On Node 25 it's present by default but has no
// real backing store, and it shadows jsdom's working `window.localStorage`
// on both `globalThis` and `window` — so the storage-util suites blow up
// with "localStorage.clear is not a function". CI pins Node 20 (where the
// native global doesn't exist and jsdom's Storage is used), but to keep
// the suite deterministic on any local Node version we install a small
// in-memory Storage and force it onto both globals.
class MemoryStorage implements Storage {
  private store = new Map<string, string>()
  get length() {
    return this.store.size
  }
  clear() {
    this.store.clear()
  }
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null
  }
  setItem(key: string, value: string) {
    this.store.set(key, String(value))
  }
  removeItem(key: string) {
    this.store.delete(key)
  }
  key(index: number) {
    return Array.from(this.store.keys())[index] ?? null
  }
}

// One shared instance so `localStorage` (global) and `window.localStorage`
// are the same store — production code reads either form.
const memoryStorage = new MemoryStorage()
for (const target of [window, globalThis]) {
  Object.defineProperty(target, "localStorage", {
    configurable: true,
    writable: true,
    value: memoryStorage,
  })
}
