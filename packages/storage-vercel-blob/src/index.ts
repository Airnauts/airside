import type { PutBlob, PutResult, StorageAdapter } from '@comments/server'
import { put } from '@vercel/blob'

export type VercelBlobStorageOptions = {
  /** `BLOB_READ_WRITE_TOKEN`. If omitted, `@vercel/blob` reads it from `process.env`. */
  token?: string
  /**
   * Optional prefix (e.g. 'staging/') applied to every key. A trailing `/` is
   * appended automatically if missing, so `'staging'` and `'staging/'` behave
   * the same way.
   */
  prefix?: string
}

function sanitizeName(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 200)
  return cleaned.length > 0 ? cleaned : 'file'
}

async function readAllBytes(data: Uint8Array | ReadableStream<Uint8Array>): Promise<Uint8Array> {
  if (data instanceof Uint8Array) return data
  const reader = data.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      if (value) {
        chunks.push(value)
        total += value.byteLength
      }
    }
  } finally {
    reader.releaseLock()
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.byteLength
  }
  return out
}

export class VercelBlobStorage implements StorageAdapter {
  private readonly prefix: string

  constructor(private readonly opts: VercelBlobStorageOptions = {}) {
    const raw = opts.prefix ?? ''
    this.prefix = raw === '' || raw.endsWith('/') ? raw : `${raw}/`
  }

  async put(blob: PutBlob): Promise<PutResult> {
    const bytes = await readAllBytes(blob.data)
    const body = new Blob([bytes], { type: blob.contentType })
    const key = `${this.prefix}${sanitizeName(blob.name)}`
    const result = await put(key, body, {
      access: 'public',
      contentType: blob.contentType,
      addRandomSuffix: true,
      token: this.opts.token,
    })
    return {
      key: result.pathname,
      url: result.url,
      size: bytes.byteLength,
    }
  }
}

export const packageName = '@comments/storage-vercel-blob'
