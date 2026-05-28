import { randomBytes } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, posix } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { PutBlob, PutResult, StorageAdapter } from '@comments/server'

export type FileSystemStorageOptions = {
  rootDir: string
}

function sanitizeName(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9._-]/g, '_')
  return cleaned.length > 0 ? cleaned : 'file'
}

function uniqueKey(name: string): string {
  const ts = Date.now().toString(36)
  const rand = randomBytes(6).toString('hex')
  const safe = sanitizeName(name)
  return posix.join(ts, `${rand}-${safe}`)
}

async function readAllBytes(data: Uint8Array | ReadableStream<Uint8Array>): Promise<Uint8Array> {
  if (data instanceof Uint8Array) return data
  const reader = data.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    if (value) {
      chunks.push(value)
      total += value.byteLength
    }
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.byteLength
  }
  return out
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
      url: pathToFileURL(abs).href,
      size: bytes.byteLength,
    }
  }
}

export const packageName = '@comments/storage-fs'
