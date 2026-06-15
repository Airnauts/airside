/**
 * Rebuild the mount-stripped, operation-relative URL a mounted server expects,
 * from a catch-all route's segments plus the original query string. The server
 * core is mount-unaware (no basePath), so `segments` must be the bits AFTER the
 * mount — Next's `params.path` (App Router) or `req.query.path` (Pages Router).
 */
export function operationUrl(
  segments: string[] | string | undefined,
  search: string,
  origin: string,
): URL {
  const list = Array.isArray(segments) ? segments : segments ? [segments] : []
  return new URL(`/${list.join('/')}${search}`, origin)
}
