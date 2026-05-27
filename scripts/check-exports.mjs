// scripts/check-exports.mjs
import assert from 'node:assert/strict'

// Every package entry + subpath that must resolve through its package.json `exports`,
// paired with a named export that proves the module actually loaded.
// Shell packages still expose the M1 `packageName`; @comments/core now exposes the
// real contract surface, so we probe one of its real exports instead.
const entries = [
  ['@comments/core', 'normalizePageKey'],
  ['@comments/client', 'packageName'],
  ['@comments/client/react', 'packageName'],
  ['@comments/server', 'packageName'],
  ['@comments/server/next', 'packageName'],
  ['@comments/adapter-mongo', 'packageName'],
  ['@comments/storage-vercel-blob', 'packageName'],
  ['@comments/storage-fs', 'packageName'],
]

for (const [id, sym] of entries) {
  const mod = await import(id)
  assert.notEqual(mod[sym], undefined, `${id} did not resolve to a module exporting "${sym}"`)
  console.log(`✓ ${id} -> ${sym}`)
}

console.log(`\nAll ${entries.length} package entries resolved through their exports maps.`)
