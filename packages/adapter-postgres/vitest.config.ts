import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'adapter-postgres',
    environment: 'node',
  },
})
