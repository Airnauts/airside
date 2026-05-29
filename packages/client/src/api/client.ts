import {
  type AddCommentBody,
  type Attachment,
  type Comment,
  type CreateThreadBody,
  KEY_HEADER_NAME,
  type RefreshAnchorBody,
  type SetThreadStatusBody,
  type Thread,
  type ThreadListItem,
  type ThreadListResponse,
  type ThreadStatus,
} from '@comments/core'
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

export interface ApiClient {
  createThread(body: CreateThreadBody): Promise<Thread>
  listThreads(params?: ListParams): Promise<ThreadListResponse>
  getThread(id: string): Promise<Thread>
  addComment(id: string, body: AddCommentBody): Promise<Comment>
  setThreadStatus(id: string, body: SetThreadStatusBody): Promise<Thread>
  refreshAnchor(id: string, body: RefreshAnchorBody): Promise<ThreadListItem>
  upload(file: File): Promise<Attachment>
}

export function createApiClient(opts: ApiClientOptions): ApiClient {
  const base = opts.endpoint.replace(/\/+$/, '')
  const doFetch: FetchLike = opts.fetch ?? ((input, init) => fetch(input, init))

  async function request<T>(method: string, path: string, body?: unknown, isForm = false): Promise<T> {
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
      const err = (json as { error?: { code?: string; message?: string; details?: unknown } } | undefined)?.error
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

  return {
    createThread: (body) => request<Thread>('POST', '/threads', body),
    listThreads: (params) => request<ThreadListResponse>('GET', `/threads${qs(params)}`),
    getThread: (threadId) => request<Thread>('GET', `/threads/${id(threadId)}`),
    addComment: (threadId, body) => request<Comment>('POST', `/threads/${id(threadId)}/comments`, body),
    setThreadStatus: (threadId, body) => request<Thread>('PATCH', `/threads/${id(threadId)}`, body),
    refreshAnchor: (threadId, body) => request<ThreadListItem>('PATCH', `/threads/${id(threadId)}/anchor`, body),
    upload: (file) => {
      const fd = new FormData()
      fd.append('file', file)
      return request<Attachment>('POST', '/uploads', fd, true)
    },
  }
}
