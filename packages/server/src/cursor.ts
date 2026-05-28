export type CursorPayload = { updatedAt: string; id: string }

export function encodeCursor(payload: CursorPayload): string {
  const json = JSON.stringify({ u: payload.updatedAt, i: payload.id })
  return Buffer.from(json, 'utf8').toString('base64url')
}

export function decodeCursor(token: string): CursorPayload | undefined {
  if (!token) return undefined
  let raw: string
  try {
    raw = Buffer.from(token, 'base64url').toString('utf8')
  } catch {
    return undefined
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return undefined
  }
  if (!parsed || typeof parsed !== 'object') return undefined
  const obj = parsed as { u?: unknown; i?: unknown }
  if (typeof obj.u !== 'string' || typeof obj.i !== 'string') return undefined
  return { updatedAt: obj.u, id: obj.i }
}
