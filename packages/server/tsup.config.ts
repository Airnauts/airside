import { defineConfig } from 'tsup'

export default defineConfig({
  entry: { index: 'src/index.ts', dev: 'src/dev.ts', next: 'src/next.ts' },
  format: ['esm'],
  dts: false,
  sourcemap: true,
  outDir: 'dist',
  // Remove stale .js/.d.ts before the build. NOTE: tsup's clean does NOT
  // delete the dotfile dist/.tsbuildinfo, so declaration re-emit is forced by
  // `tsc --build --force` in package.json, not by this clean (ADR-0023).
  clean: true,
})
