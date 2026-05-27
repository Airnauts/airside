// scripts/check-exports.mjs
import assert from 'node:assert/strict'

// Every package entry + subpath that must resolve through its package.json `exports`.
const entries = [
  '@comments/core',
  '@comments/client',
  '@comments/client/react',
  '@comments/server',
  '@comments/server/next',
  '@comments/adapter-mongo',
  '@comments/storage-vercel-blob',
  '@comments/storage-fs',
]

for (const id of entries) {
  const mod = await import(id)
  assert.equal(
    typeof mod.packageName,
    'string',
    `${id} did not resolve to a module exporting "packageName"`,
  )
  console.log(`✓ ${id} -> ${mod.packageName}`)
}

console.log(`\nAll ${entries.length} package entries resolved through their exports maps.`)
