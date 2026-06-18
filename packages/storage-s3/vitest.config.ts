import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'storage-s3',
    environment: 'node',
  },
})
