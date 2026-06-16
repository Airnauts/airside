import { defineConfig } from 'tsup'

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  dts: false,
  sourcemap: true,
  outDir: 'dist',
  platform: 'browser',
  external: ['react', '@airnauts/airside-client'],
  banner: { js: "'use client'" },
  clean: true,
})
