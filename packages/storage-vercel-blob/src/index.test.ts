import { storageContract } from '@airnauts/comments-test-support'
import { del } from '@vercel/blob'
import { afterAll, describe, it } from 'vitest'
import { VercelBlobStorage } from './index'

const token = process.env.BLOB_READ_WRITE_TOKEN

if (token) {
  const uploaded: string[] = []
  const testPrefix = `test-${Date.now()}/`

  storageContract(
    'vercel-blob',
    async () => {
      const storage = new VercelBlobStorage({ token, prefix: testPrefix })
      // Wrap put() so every successful upload is tracked for cleanup.
      const originalPut = storage.put.bind(storage)
      storage.put = async (blob) => {
        const result = await originalPut(blob)
        uploaded.push(result.url)
        return result
      }
      return storage
    },
    async (url) => {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`readBack failed: ${res.status}`)
      return new Uint8Array(await res.arrayBuffer())
    },
  )

  afterAll(async () => {
    if (uploaded.length > 0) {
      await del(uploaded, { token })
    }
  })
} else {
  describe('StorageAdapter contract — vercel-blob', () => {
    it.skip('skipped: BLOB_READ_WRITE_TOKEN not set', () => {})
  })
}
