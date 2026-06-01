import type { Attachment, AttachmentId } from '@airnauts/comments-core'
import type { StorageAdapter } from '@airnauts/comments-server'
import { describe, expect, it } from 'vitest'
import { defaultIds, makeCtx } from '../ctx'
import { UploadTooLargeError, ValidationError } from '../errors'
import { uploadAttachment } from './upload-attachment'

class StubStorage implements StorageAdapter {
  putCalls: { contentType: string; size: number }[] = []
  async put(blob: {
    data: Uint8Array | ReadableStream<Uint8Array>
    contentType: string
    name: string
  }) {
    const bytes = blob.data instanceof Uint8Array ? blob.data : new Uint8Array()
    this.putCalls.push({ contentType: blob.contentType, size: bytes.byteLength })
    return { key: 'k', url: 'https://blob.test/k', size: bytes.byteLength }
  }
}

const ctx = makeCtx({
  projectId: 'proj_x',
  ids: { ...defaultIds(), attachment: () => 'at_fixed' as AttachmentId },
})

function blob(type: string, bytes: number): Blob {
  return new Blob([new Uint8Array(bytes)], { type })
}

describe('uploadAttachment use-case', () => {
  it('stores an allowed image and returns an Attachment', async () => {
    const storage = new StubStorage()
    const out: Attachment = await uploadAttachment(
      {
        ctx,
        params: undefined,
        query: undefined,
        body: { data: blob('image/png', 100), name: 'x.png', contentType: 'image/png' },
      },
      { storage, ids: ctx.ids, maxBytes: 1000 },
    )
    expect(out.id).toBe('at_fixed')
    expect(out.url).toBe('https://blob.test/k')
    expect(out.contentType).toBe('image/png')
    expect(out.size).toBe(100)
  })

  it('rejects disallowed content types', async () => {
    const storage = new StubStorage()
    await expect(
      uploadAttachment(
        {
          ctx,
          params: undefined,
          query: undefined,
          body: {
            data: blob('application/pdf', 100),
            name: 'x.pdf',
            contentType: 'application/pdf',
          },
        },
        { storage, ids: ctx.ids, maxBytes: 1000 },
      ),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('rejects oversize blobs', async () => {
    const storage = new StubStorage()
    await expect(
      uploadAttachment(
        {
          ctx,
          params: undefined,
          query: undefined,
          body: { data: blob('image/png', 2000), name: 'x.png', contentType: 'image/png' },
        },
        { storage, ids: ctx.ids, maxBytes: 1000 },
      ),
    ).rejects.toBeInstanceOf(UploadTooLargeError)
  })
})
