import type { Attachment, AttachmentId } from '@airnauts/airside-core'
import { ValidationError } from '../errors'
import type { Repository, Scope } from '../repository/types'

/**
 * Resolve client-referenced attachment ids (architecture §6, two-step uploads) to the
 * full `Attachment` metadata persisted at upload time, returned in the requested order.
 *
 * Throws ValidationError if any id can't be resolved (never uploaded, expired, or
 * belongs to a different scope) so the caller surfaces a clean 400 rather than
 * silently dropping the user's image.
 */
export async function resolveAttachments(
  repo: Repository,
  scope: Scope,
  ids: AttachmentId[] | undefined,
): Promise<Attachment[]> {
  if (!ids || ids.length === 0) return []
  const found = await repo.getAttachments(scope, ids)
  const byId = new Map(found.map((a) => [a.id, a]))
  const missing = ids.filter((id) => !byId.has(id))
  if (missing.length > 0) {
    throw new ValidationError(`unknown attachment id(s): ${missing.join(', ')}`)
  }
  // Preserve the client's order; getAttachments order is unspecified.
  return ids.map((id) => byId.get(id) as Attachment)
}
