import { randomBytes } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, posix } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  type PutBlob,
  type PutResult,
  readAllBytes,
  type StorageAdapter,
  sanitizeName,
} from '@airnauts/comments-server'

export type FileSystemStorageOptions = {
  rootDir: string
  /**
   * Public URL base. When set, `put` returns `${baseUrl}/${key}` (a browser-served
   * path) instead of a `file://` URL. A trailing slash is trimmed.
   */
  baseUrl?: string
}

function uniqueKey(name: string): string {
  const ts = Date.now().toString(36)
  const rand = randomBytes(6).toString('hex')
  const safe = sanitizeName(name)
  return posix.join(ts, `${rand}-${safe}`)
}

export class FileSystemStorage implements StorageAdapter {
  constructor(private readonly opts: FileSystemStorageOptions) {}

  async put(blob: PutBlob): Promise<PutResult> {
    const key = uniqueKey(blob.name)
    const abs = join(this.opts.rootDir, key)
    await mkdir(join(abs, '..'), { recursive: true })
    const bytes = await readAllBytes(blob.data)
    await writeFile(abs, bytes)
    return {
      key,
      url: this.opts.baseUrl
        ? `${this.opts.baseUrl.replace(/\/$/, '')}/${key}`
        : pathToFileURL(abs).href,
      size: bytes.byteLength,
    }
  }
}

/** Construct a filesystem `StorageAdapter` (uniform `create<Provider>Storage(config)` shape). */
export function createFileSystemStorage(opts: FileSystemStorageOptions): StorageAdapter {
  return new FileSystemStorage(opts)
}

/** @deprecated Renamed to {@link createFileSystemStorage}; kept for one release. */
export const fileSystemStorage = createFileSystemStorage

export const packageName = '@airnauts/comments-storage-fs'
