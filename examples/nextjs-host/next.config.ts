import type { NextConfig } from 'next'

const config: NextConfig = {
  // @airnauts/airside-client ships ESM dist; transpiling avoids interop surprises in the client bundle.
  transpilePackages: ['@airnauts/airside-client'],
  // mongodb is server-only and has dynamic requires; keep it external to the bundle.
  serverExternalPackages: ['mongodb'],
  // We lint with Biome at the repo root, not Next's ESLint integration.
  eslint: { ignoreDuringBuilds: true },
}

export default config
