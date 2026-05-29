import type { Db } from 'mongodb'
import { COLLECTION } from './repository'

/**
 * Create the scoped indexes from architecture §5. Idempotent: MongoDB's
 * createIndexes is a no-op when an identical index already exists, so this is
 * safe to run on every startup.
 */
export async function ensureIndexes(db: Db): Promise<void> {
  await db.collection(COLLECTION).createIndexes([
    { key: { projectId: 1, pageKey: 1 }, name: 'projectId_pageKey' },
    { key: { projectId: 1, updatedAt: -1 }, name: 'projectId_updatedAt' },
    { key: { projectId: 1, status: 1 }, name: 'projectId_status' },
  ])
}
