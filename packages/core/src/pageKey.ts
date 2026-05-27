export type PageKeyFn = (url: string) => string

export function normalizePageKey(url: string | URL): string {
  const u = typeof url === 'string' ? new URL(url) : url
  let pathname = u.pathname
  if (pathname.length > 1 && pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1)
  }
  return `${u.origin}${pathname}`
}
