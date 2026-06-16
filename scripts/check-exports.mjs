// scripts/check-exports.mjs
import assert from 'node:assert/strict'

// Every package entry + subpath integrators may import must resolve through its
// package.json `exports`, paired with a named export that proves the module loaded.
// Shell packages still expose `packageName` (M1 placeholder) except @airnauts/airside-server
// which now exports VERSION; @airnauts/airside-core exposes its real contract surface.
// @airnauts/airside-test-support is deliberately excluded — it's `private: true` and its
// contract suites import vitest at module load, which crashes outside the runner.
const entries = [
  ['@airnauts/airside-core', 'normalizePageKey'],
  ['@airnauts/airside-client', 'packageName'],
  ['@airnauts/airside-client/react', 'packageName'],
  ['@airnauts/airside-server', 'VERSION'],
  ['@airnauts/airside-server/dev', 'createDevServer'],
  ['@airnauts/airside-server/node', 'nodeRequestToWeb'],
  ['@airnauts/airside-adapter-mongo', 'createMongoRepository'],
  ['@airnauts/airside-storage-vercel-blob', 'packageName'],
  ['@airnauts/airside-storage-fs', 'packageName'],
]

for (const [id, sym] of entries) {
  const mod = await import(id)
  assert.notEqual(mod[sym], undefined, `${id} did not resolve to a module exporting "${sym}"`)
  console.log(`✓ ${id} -> ${sym}`)
}

console.log(`\nAll ${entries.length} package entries resolved through their exports maps.`)
