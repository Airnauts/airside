import { InMemoryRepository } from '@airnauts/airside-adapter-memory'
import type { ThreadId } from '@airnauts/airside-core'
import { makeNewThread } from '@airnauts/airside-test-support'
import { describe, expect, it } from 'vitest'
import { makeCtx } from '../ctx'
import { NotFoundError } from '../errors'
import { deleteThread } from './delete-thread'

const ctx = () => makeCtx({ projectId: 'proj_x' })

describe('deleteThread use-case', () => {
  it('deletes an existing thread and returns its id', async () => {
    const repo = new InMemoryRepository()
    const t = await repo.createThread(makeNewThread({ projectId: 'proj_x' }))
    const out = await deleteThread(
      { ctx: ctx(), params: { id: t.id }, query: undefined, body: undefined },
      { repo },
    )
    expect(out).toEqual({ id: t.id })
    expect(await repo.getThread({ projectId: 'proj_x' }, t.id)).toBeNull()
  })

  it('throws NotFoundError when the thread does not exist', async () => {
    const repo = new InMemoryRepository()
    await expect(
      deleteThread(
        { ctx: ctx(), params: { id: 't_missing' as ThreadId }, query: undefined, body: undefined },
        { repo },
      ),
    ).rejects.toBeInstanceOf(NotFoundError)
  })
})
