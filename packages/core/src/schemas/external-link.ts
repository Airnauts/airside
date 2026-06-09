import { z } from 'zod'
import { Author } from './comment'
import { IsoTimestamp } from './common'

/**
 * A durable link from a thread to an external system (Jira, etc.).
 * Persisted on the thread; deduped by `provider`.
 */
export const ExternalLink = z
  .object({
    provider: z.string(),
    externalId: z.string(),
    key: z.string().optional(),
    label: z.string(),
    url: z.url(),
    createdAt: IsoTimestamp,
    createdBy: Author.optional(),
  })
  .meta({ id: 'ExternalLink' })
export type ExternalLink = z.infer<typeof ExternalLink>
