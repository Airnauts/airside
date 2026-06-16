import { defineConfig } from 'tsup'

export default defineConfig([
  {
    // Server route handlers (App + Pages Router). Node-side, no React.
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    dts: false,
    sourcemap: true,
    outDir: 'dist',
    clean: false,
  },
  {
    // Client mount re-export. Browser module; ships 'use client' so it can be
    // imported from an RSC tree. React + the React package stay external.
    entry: { client: 'src/client.ts' },
    format: ['esm'],
    dts: false,
    sourcemap: true,
    outDir: 'dist',
    platform: 'browser',
    external: ['react', '@airnauts/airside-integration-react'],
    banner: { js: "'use client'" },
    clean: false,
  },
])
