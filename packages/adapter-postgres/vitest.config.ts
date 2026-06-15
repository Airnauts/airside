import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'adapter-postgres',
    environment: 'node',
    // PGlite's cold start (WASM compile + initdb) can exceed vitest's 10s default
    // when both test files boot an instance concurrently on a slow CI runner.
    hookTimeout: 60_000,
  },
})
