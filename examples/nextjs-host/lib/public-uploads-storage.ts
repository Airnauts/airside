import { join } from 'node:path'
import type { PutBlob, PutResult, StorageAdapter } from '@airnauts/comments-server'
import { FileSystemStorage } from '@airnauts/comments-storage-fs'

/**
 * Writes uploads under `public/uploads/` and returns a browser-served path
 * (`/uploads/<key>`) instead of `FileSystemStorage`'s default `file://` URL.
 */
export function publicUploadsStorage(): StorageAdapter {
  const fs = new FileSystemStorage({ rootDir: join(process.cwd(), 'public', 'uploads') })
  return {
    async put(blob: PutBlob): Promise<PutResult> {
      const result = await fs.put(blob)
      return { ...result, url: `/uploads/${result.key}` }
    },
  }
}
