---
"@airnauts/airside-client": minor
---

**Breaking:** removed the `@airnauts/airside-client/react` subpath. The `<AirsideLayer/>` React wrapper now ships as `@airnauts/airside-integration-react` (or `@airnauts/airside-integration-next/client` for Next.js hosts). `@airnauts/airside-client` no longer declares `react`/`react-dom` peer dependencies — the vanilla `init()` engine bundles its own React.
