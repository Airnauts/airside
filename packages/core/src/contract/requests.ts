import { z } from 'zod'
import { AttachmentId, ThreadId } from '../ids'
import { Anchor, Signals } from '../schemas/anchor'
import { CaptureContext, Provenance } from '../schemas/capture'
import { Author } from '../schemas/comment'
import { Cursor } from '../schemas/common'
import { AnchorState, ThreadStatus } from '../schemas/thread'

const Selectors = z.tuple([z.string(), z.string()])

// A comment must carry content: either non-blank text or at least one attachment.
// Text alone, image alone, or both are all valid — image-only comments are allowed.
const hasContent = (c: { text: string; attachmentIds?: readonly string[] }): boolean =>
  c.text.trim().length > 0 || (c.attachmentIds?.length ?? 0) > 0
const CONTENT_REQUIRED = { message: 'a comment needs text or an attachment' }

export const CreateThreadBody = z
  .object({
    pageKey: z.string().optional(),
    pageUrl: z.url(),
    pageTitle: z.string().optional(),
    anchor: Anchor,
    comment: z
      .object({ text: z.string(), attachmentIds: z.array(AttachmentId).optional() })
      .refine(hasContent, CONTENT_REQUIRED),
    author: Author,
    captureContext: CaptureContext,
    provenance: Provenance.optional(),
  })
  .meta({ id: 'CreateThreadBody' })
export type CreateThreadBody = z.infer<typeof CreateThreadBody>

export const ListThreadsQuery = z
  .object({
    pageKey: z.string().optional(),
    status: ThreadStatus.optional(),
    sort: z.literal('updatedAt').optional(),
    cursor: Cursor.optional(),
  })
  .meta({ id: 'ListThreadsQuery' })
export type ListThreadsQuery = z.infer<typeof ListThreadsQuery>

export const ThreadIdParam = z.object({ id: ThreadId })
export type ThreadIdParam = z.infer<typeof ThreadIdParam>

export const AddCommentBody = z
  .object({
    text: z.string(),
    attachmentIds: z.array(AttachmentId).optional(),
    author: Author,
  })
  .refine(hasContent, CONTENT_REQUIRED)
  .meta({ id: 'AddCommentBody' })
export type AddCommentBody = z.infer<typeof AddCommentBody>

export const SetThreadStatusBody = z
  .object({ status: ThreadStatus })
  .meta({ id: 'SetThreadStatusBody' })
export type SetThreadStatusBody = z.infer<typeof SetThreadStatusBody>

export const RefreshAnchorBody = z
  .object({
    selectors: Selectors.optional(),
    signals: Signals.optional(),
    anchorState: AnchorState,
    selectionLost: z.boolean().optional(),
  })
  .meta({ id: 'RefreshAnchorBody' })
export type RefreshAnchorBody = z.infer<typeof RefreshAnchorBody>

// Documentation-only shape for the multipart upload (the binary is validated server-side).
export const UploadForm = z
  .object({
    file: z.string().meta({ override: { type: 'string', format: 'binary' } }),
  })
  .meta({ id: 'UploadForm' })
export type UploadForm = z.infer<typeof UploadForm>
