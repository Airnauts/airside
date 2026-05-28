// scripts/check-exports.mjs
import assert from 'node:assert/strict'

// Every package entry + subpath integrators may import must resolve through its
// package.json `exports`, paired with a named export that proves the module loaded.
// Shell packages still expose `packageName` (M1 placeholder) except @comments/server
// which now exports VERSION; @comments/core exposes its real contract surface.
// @comments/test-support is deliberately excluded — it's `private: true` and its
// contract suites import vitest at module load, which crashes outside the runner.
const entries = [
  ['@comments/core', 'normalizePageKey'],
  ['@comments/client', 'packageName'],
  ['@comments/client/react', 'packageName'],
  ['@comments/server', 'VERSION'],
  ['@comments/server/dev', 'createDevServer'],
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
