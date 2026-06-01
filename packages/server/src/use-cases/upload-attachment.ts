import type { Attachment } from '@airnauts/comments-core'
import type { Ctx, IdFactory } from '../ctx'
import { UploadTooLargeError, ValidationError } from '../errors'
import type { ParsedUpload } from '../multipart'
import type { StorageAdapter } from '../storage/types'

export const ALLOWED_UPLOAD_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const
export type AllowedUploadType = (typeof ALLOWED_UPLOAD_TYPES)[number]

export type UploadAttachmentDeps = {
  storage: StorageAdapter
  ids: IdFactory
  /** Max bytes per upload. Default 5 MB. */
  maxBytes?: number
}

export async function uploadAttachment(
  input: { ctx: Ctx; params: undefined; query: undefined; body: ParsedUpload },
  deps: UploadAttachmentDeps,
): Promise<Attachment> {
  const { body } = input
  const max = deps.maxBytes ?? 5 * 1024 * 1024
  if (!ALLOWED_UPLOAD_TYPES.includes(body.contentType as AllowedUploadType)) {
    throw new ValidationError(`unsupported content-type: ${body.contentType}`)
  }
  const blob = body.data
  if (blob.size > max) {
    throw new UploadTooLargeError(`upload exceeds ${max} bytes`)
  }
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const stored = await deps.storage.put({
    data: bytes,
    contentType: body.contentType,
    name: body.name,
  })
  return {
    id: deps.ids.attachment(),
    url: stored.url,
    name: body.name,
    contentType: body.contentType,
    size: stored.size,
  }
}
