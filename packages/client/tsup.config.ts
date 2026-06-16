import { defineConfig } from 'tsup'

export default defineConfig({
  // Vanilla widget: self-contained, bundles its OWN React + all UI deps.
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  dts: false,
  sourcemap: true,
  outDir: 'dist',
  platform: 'browser',
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  noExternal: [/.*/],
  splitting: false, // keep createRoot in index.js (dynamic import('./app/mount') must not split)
  clean: false, // the `build` script does `rm -rf dist` once, before tsup
})
