import {
  type PutBlob,
  type PutResult,
  readAllBytes,
  type StorageAdapter,
  sanitizeName,
} from '@airnauts/comments-server'
import { put } from '@vercel/blob'

export type VercelBlobStorageOptions = {
  /** `BLOB_READ_WRITE_TOKEN`, passed explicitly (no ambient `process.env` read). */
  token: string
  /**
   * Optional prefix (e.g. 'staging/') applied to every key. A trailing `/` is
   * appended automatically if missing, so `'staging'` and `'staging/'` behave
   * the same way.
   */
  prefix?: string
}

export class VercelBlobStorage implements StorageAdapter {
  private readonly prefix: string

  constructor(private readonly opts: VercelBlobStorageOptions) {
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

/** Construct a Vercel Blob `StorageAdapter` (uniform `create<Provider>Storage(config)` shape). */
export function createVercelBlobStorage(opts: VercelBlobStorageOptions): StorageAdapter {
  return new VercelBlobStorage(opts)
}

/** @deprecated Renamed to {@link createVercelBlobStorage}; kept for one release. */
export const vercelBlobStorage = createVercelBlobStorage

export const packageName = '@airnauts/comments-storage-vercel-blob'
