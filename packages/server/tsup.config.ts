import { defineConfig } from 'tsup'

export default defineConfig({
  entry: { index: 'src/index.ts', dev: 'src/dev.ts', next: 'src/next.ts' },
  format: ['esm'],
  dts: false,
  sourcemap: true,
  outDir: 'dist',
  // Clean the whole dist (incl. stale .tsbuildinfo) so the following
  // `tsc --build` always full-rebuilds and re-emits .d.ts (ADR-0019).
  clean: true,
})
