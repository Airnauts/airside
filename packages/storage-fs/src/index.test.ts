import { mkdtempSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { storageContract } from '@airnauts/comments-test-support'
import { describe, expect, it } from 'vitest'
import { FileSystemStorage, fileSystemStorage } from './index'

storageContract(
  'fs',
  async () => {
    const dir = mkdtempSync(join(tmpdir(), 'comments-storage-fs-'))
    return new FileSystemStorage({ rootDir: dir })
  },
  async (url) => new Uint8Array(await readFile(fileURLToPath(url))),
)

function blob(name = 'a.bin') {
  return { data: new Uint8Array([1, 2, 3]), contentType: 'application/octet-stream', name }
}

describe('fileSystemStorage baseUrl', () => {
  it('returns a baseUrl-relative url when baseUrl is set', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'comments-storage-fs-'))
    const store = fileSystemStorage({ rootDir: dir, baseUrl: '/uploads' })
    const res = await store.put(blob())
    expect(res.url).toBe(`/uploads/${res.key}`)
  })

  it('strips a trailing slash on baseUrl', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'comments-storage-fs-'))
    const store = fileSystemStorage({ rootDir: dir, baseUrl: '/uploads/' })
    const res = await store.put(blob())
    expect(res.url).toBe(`/uploads/${res.key}`)
  })

  it('falls back to a file:// url when baseUrl is absent', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'comments-storage-fs-'))
    const store = fileSystemStorage({ rootDir: dir })
    const res = await store.put(blob())
    expect(res.url.startsWith('file://')).toBe(true)
  })
})
