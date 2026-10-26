// Workaround for an @atproto/lex 0.4.2 code-generation bug.
//
// When a query lexicon lives under a record NSID used as its namespace
// (org.hypercerts.collection.getCollection referencing org.hypercerts.collection),
// `lex build` emits `import ... from "./.defs"` instead of the parent's
// `../collection.defs`. This rewrites those imports after generation.
// Remove once fixed upstream.
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { basename, dirname, join } from "node:path"

const root = process.argv[2] ?? "src/lexicons"
const broken = /from "\.\/\.defs(\.js)?"/g
let fixed = 0

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      walk(path)
    } else if (name.endsWith(".ts")) {
      const source = readFileSync(path, "utf8")
      if (!broken.test(source)) continue
      const parent = basename(dirname(path))
      writeFileSync(path, source.replace(broken, (_match, ext = "") => `from "../${parent}.defs${ext}"`))
      fixed += 1
    }
  }
}

walk(root)
console.log(`fix-lex-imports: rewrote ${fixed} file(s)`)
