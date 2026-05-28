import { storageContract } from '@comments/test-support'
import { describe, it } from 'vitest'
import { VercelBlobStorage } from './index'

const token = process.env.BLOB_READ_WRITE_TOKEN
if (token) {
  storageContract(
    'vercel-blob',
    async () => new VercelBlobStorage({ token }),
    async (url) => {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`readBack failed: ${res.status}`)
      return new Uint8Array(await res.arrayBuffer())
    },
  )
} else {
  describe('StorageAdapter contract — vercel-blob', () => {
    it.skip('skipped: BLOB_READ_WRITE_TOKEN not set', () => {})
  })
}
