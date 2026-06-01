// scripts/check-exports.mjs
import assert from 'node:assert/strict'

// Every package entry + subpath integrators may import must resolve through its
// package.json `exports`, paired with a named export that proves the module loaded.
// Shell packages still expose `packageName` (M1 placeholder) except @airnauts/comments-server
// which now exports VERSION; @airnauts/comments-core exposes its real contract surface.
// @airnauts/comments-test-support is deliberately excluded — it's `private: true` and its
// contract suites import vitest at module load, which crashes outside the runner.
const entries = [
  ['@airnauts/comments-core', 'normalizePageKey'],
  ['@airnauts/comments-client', 'packageName'],
  ['@airnauts/comments-client/react', 'packageName'],
  ['@airnauts/comments-server', 'VERSION'],
  ['@airnauts/comments-server/dev', 'createDevServer'],
  ['@airnauts/comments-server/next', 'createNextHandler'],
  ['@airnauts/comments-adapter-mongo', 'createMongoRepository'],
  ['@airnauts/comments-storage-vercel-blob', 'packageName'],
  ['@airnauts/comments-storage-fs', 'packageName'],
]

for (const [id, sym] of entries) {
  const mod = await import(id)
  assert.notEqual(mod[sym], undefined, `${id} did not resolve to a module exporting "${sym}"`)
  console.log(`✓ ${id} -> ${sym}`)
}

console.log(`\nAll ${entries.length} package entries resolved through their exports maps.`)
