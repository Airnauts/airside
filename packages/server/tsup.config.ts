import { defineConfig } from 'tsup'

export default defineConfig({
  entry: { index: 'src/index.ts', dev: 'src/dev.ts' },
  format: ['esm'],
  dts: false,
  sourcemap: true,
  outDir: 'dist',
  clean: ['dist/**/*.js', 'dist/**/*.js.map'],
})
