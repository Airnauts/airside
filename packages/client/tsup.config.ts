import { defineConfig } from 'tsup'

export default defineConfig([
  {
    // Vanilla widget: self-contained, bundles its OWN React + all UI deps.
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    dts: false,
    sourcemap: true,
    outDir: 'dist',
    noExternal: [/.*/],
    splitting: false, // keep createRoot in index.js (dynamic import('./app/mount') must not split)
    clean: false, // the `build` script does `rm -rf dist` once, before tsup
  },
  {
    // React wrapper: uses the HOST's React (external) and references the sibling
    // widget bundle (./index.js) at runtime — it must NOT re-bundle React or the widget.
    entry: { react: 'src/react.ts' },
    format: ['esm'],
    dts: false,
    sourcemap: true,
    outDir: 'dist',
    external: ['react', 'react-dom'],
    esbuildPlugins: [
      {
        name: 'external-sibling-widget',
        setup(build) {
          // react.ts imports from './index'; keep it external (a deterministic
          // onResolve beats esbuild's flaky relative-path `external` matching) so
          // the one widget bundle (with its own React) loads at runtime.
          build.onResolve({ filter: /^\.\/index(\.js)?$/ }, () => ({ path: './index.js', external: true }))
        },
      },
    ],
    clean: false,
  },
])
