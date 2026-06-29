import {
  type AddCommentBody,
  type Attachment,
  type Comment,
  type CreateThreadBody,
  KEY_HEADER_NAME,
  type RealtimeEvent,
  type RefreshAnchorBody,
  type SetThreadStatusBody,
  type ThreadListItem,
  type ThreadListResponse,
  type ThreadStatus,
  type ThreadView,
} from '@airnauts/airside-core'
import { createSseParser } from '../realtime/parse'
import { ApiError } from './errors'

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export type ApiClientOptions = {
  endpoint: string
  key: string
  fetch?: FetchLike
}

export type ListParams = {
  pageKey?: string
  status?: ThreadStatus
  sort?: 'updatedAt'
  cursor?: string
}

/** Scope of a live-update stream: a page (pins) or, with no `pageKey`, the whole project/env (panel). */
export type StreamParams = { pageKey?: string }

export type StreamHandlers = {
  onEvent: (event: RealtimeEvent) => void
  /** Fired once the stream connects (response headers received). */
  onOpen?: () => void
  /** Fired when the stream ends or errors — but NOT when the caller unsubscribes. */
  onClose?: () => void
}

export interface ApiClient {
  createThread(body: CreateThreadBody): Promise<ThreadView>
  listThreads(params?: ListParams): Promise<ThreadListResponse>
  getThread(id: string): Promise<ThreadView>
  addComment(id: string, body: AddCommentBody): Promise<Comment>
  setThreadStatus(id: string, body: SetThreadStatusBody): Promise<ThreadView>
  refreshAnchor(id: string, body: RefreshAnchorBody): Promise<ThreadListItem>
  upload(file: File): Promise<Attachment>
  runThreadAction(id: string, actionId: string): Promise<ThreadView>
  /**
   * Open a single fetch-streamed SSE connection to `GET /events` (key in the header, so
   * not `EventSource`). Calls `handlers` as frames arrive; returns an unsubscribe that
   * aborts the connection. Does NOT reconnect — that is the subscriber's job.
   */
  streamEvents(params: StreamParams, handlers: StreamHandlers): () => void
}

export function createApiClient(opts: ApiClientOptions): ApiClient {
  const base = opts.endpoint.replace(/\/+$/, '')
  const doFetch: FetchLike = opts.fetch ?? ((input, init) => fetch(input, init))

  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
    isForm = false,
  ): Promise<T> {
    const headers: Record<string, string> = { [KEY_HEADER_NAME]: opts.key }
    let payload: BodyInit | undefined
    if (isForm) {
      payload = body as FormData
    } else if (body !== undefined) {
      headers['content-type'] = 'application/json'
      payload = JSON.stringify(body)
    }
    const res = await doFetch(`${base}${path}`, { method, headers, body: payload })
    const text = await res.text()
    let json: unknown
    try {
      json = text ? JSON.parse(text) : undefined
    } catch {
      /* non-JSON body (e.g. a proxy/gateway error page) */
    }
    if (!res.ok) {
      const err = (
        json as { error?: { code?: string; message?: string; details?: unknown } } | undefined
      )?.error
      throw new ApiError(
        res.status,
        (err?.code as ApiError['code']) ?? 'UNKNOWN',
        err?.message ?? res.statusText,
        err?.details,
      )
    }
    return json as T
  }

  function qs(params?: ListParams): string {
    if (!params) return ''
    const sp = new URLSearchParams()
    if (params.pageKey) sp.set('pageKey', params.pageKey)
    if (params.status) sp.set('status', params.status)
    if (params.sort) sp.set('sort', params.sort)
    if (params.cursor) sp.set('cursor', params.cursor)
    const s = sp.toString()
    return s ? `?${s}` : ''
  }

  const id = (raw: string) => encodeURIComponent(raw)

  function streamEvents(params: StreamParams, handlers: StreamHandlers): () => void {
    const ac = new AbortController()
    const sp = new URLSearchParams()
    if (params.pageKey) sp.set('pageKey', params.pageKey)
    const query = sp.toString()
    const url = `${base}/events${query ? `?${query}` : ''}`
    void (async () => {
      try {
        const res = await doFetch(url, {
          method: 'GET',
          headers: { [KEY_HEADER_NAME]: opts.key, accept: 'text/event-stream' },
          signal: ac.signal,
        })
        if (!res.ok || !res.body) {
          handlers.onClose?.()
          return
        }
        handlers.onOpen?.()
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        const feed = createSseParser(handlers.onEvent)
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          if (value) feed(decoder.decode(value, { stream: true }))
        }
        // Stream ended (server closed / max-lifetime): let the subscriber reconnect.
        handlers.onClose?.()
      } catch {
        // An intentional unsubscribe aborts the fetch; that is not a close to reconnect from.
        if (!ac.signal.aborted) handlers.onClose?.()
      }
    })()
    return () => ac.abort()
  }

  return {
    createThread: (body) => request<ThreadView>('POST', '/threads', body),
    listThreads: (params) => request<ThreadListResponse>('GET', `/threads${qs(params)}`),
    getThread: (threadId) => request<ThreadView>('GET', `/threads/${id(threadId)}`),
    addComment: (threadId, body) =>
      request<Comment>('POST', `/threads/${id(threadId)}/comments`, body),
    setThreadStatus: (threadId, body) =>
      request<ThreadView>('PATCH', `/threads/${id(threadId)}`, body),
    refreshAnchor: (threadId, body) =>
      request<ThreadListItem>('PATCH', `/threads/${id(threadId)}/anchor`, body),
    upload: (file) => {
      const fd = new FormData()
      fd.append('file', file)
      return request<Attachment>('POST', '/uploads', fd, true)
    },
    runThreadAction: (threadId, actionId) =>
      request<ThreadView>('POST', `/threads/${id(threadId)}/actions/${id(actionId)}`),
    streamEvents,
  }
}
