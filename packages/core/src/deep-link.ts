export const DEFAULT_THREAD_PARAM = 'airside-thread'

/** Build a deep-link URL that focuses a thread on its page. */
export function threadLink(
  pageUrl: string,
  threadId: string,
  param = DEFAULT_THREAD_PARAM,
): string {
  const url = new URL(pageUrl)
  url.searchParams.set(param, threadId)
  return url.toString()
}
