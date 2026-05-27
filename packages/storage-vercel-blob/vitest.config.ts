import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'storage-vercel-blob',
    environment: 'node',
  },
})
