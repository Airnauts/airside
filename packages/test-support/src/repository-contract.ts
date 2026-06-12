import {
  ANCHOR_SCHEMA_VERSION,
  type AttachmentId,
  type ExternalLink,
  type ThreadId,
} from '@airnauts/comments-core'
import type { Repository } from '@airnauts/comments-server'
import { beforeEach, describe, expect, it } from 'vitest'
import { makeAttachment, makeComment, makeNewThread } from './fixtures'

function makeExternalLink(overrides: Partial<ExternalLink> = {}): ExternalLink {
  return {
    provider: 'jira',
    externalId: 'PROJ-1',
    key: 'PROJ-1',
    label: 'PROJ-1',
    url: 'https://example.atlassian.net/browse/PROJ-1',
    createdAt: '2026-06-05T00:00:00.000Z',
    ...overrides,
  }
}

/**
 * Executable spec for `Repository` implementations.
 *
 * Implementations that need cleanup (DB truncation, etc.) should wrap their factory
 * (`makeRepo`) — this suite intentionally registers no `afterEach` of its own.
 */
export function repositoryContract(name: string, makeRepo: () => Promise<Repository>): void {
  describe(`Repository contract — ${name}`, () => {
    let repo: Repository

    beforeEach(async () => {
      repo = await makeRepo()
    })

    describe('createThread + getThread', () => {
      it('creates a thread that is readable by id', async () => {
        const input = makeNewThread()
        const created = await repo.createThread(input)
        expect(created.id).toBe(input.id)
        expect(created.comments).toHaveLength(1)
        expect(created.comments[0]?.text).toBe(input.firstComment.text)

        const fetched = await repo.getThread({ projectId: input.projectId }, input.id)
        expect(fetched).not.toBeNull()
        expect(fetched?.id).toBe(input.id)
      })

      it('returns null for a thread that does not exist', async () => {
        const missing = await repo.getThread({ projectId: 'proj_test' }, 't_nope' as ThreadId)
        expect(missing).toBeNull()
      })

      it('returns null when the thread exists but in a different projectId', async () => {
        const input = makeNewThread({ projectId: 'proj_a' })
        await repo.createThread(input)
        const fromOther = await repo.getThread({ projectId: 'proj_b' }, input.id)
        expect(fromOther).toBeNull()
      })

      it('returns null when env differs', async () => {
        const input = makeNewThread({ projectId: 'proj_a', env: 'prod' })
        await repo.createThread(input)
        const fromOther = await repo.getThread({ projectId: 'proj_a', env: 'staging' }, input.id)
        expect(fromOther).toBeNull()
      })
    })

    describe('listThreads', () => {
      it('on-page mode returns threads matching pageKey only', async () => {
        await repo.createThread(makeNewThread({ pageKey: '/a' }))
        await repo.createThread(makeNewThread({ pageKey: '/a' }))
        await repo.createThread(makeNewThread({ pageKey: '/b' }))
        const result = await repo.listThreads({
          projectId: 'proj_test',
          pageKey: '/a',
          sort: 'updatedAt',
          limit: 50,
        })
        expect(result.threads).toHaveLength(2)
        expect(result.threads.every((t) => t.pageKey === '/a')).toBe(true)
      })

      it('panel mode (no pageKey) returns threads across all pages ordered updatedAt desc', async () => {
        await repo.createThread(
          makeNewThread({ id: 't_old' as ThreadId, updatedAt: '2026-01-01T00:00:00.000Z' }),
        )
        await repo.createThread(
          makeNewThread({ id: 't_new' as ThreadId, updatedAt: '2026-05-01T00:00:00.000Z' }),
        )
        const result = await repo.listThreads({
          projectId: 'proj_test',
          sort: 'updatedAt',
          limit: 50,
        })
        expect(result.threads.map((t) => t.id)).toEqual(['t_new', 't_old'])
      })

      it('breaks ties on (updatedAt desc, id desc)', async () => {
        const sameTime = '2026-05-01T00:00:00.000Z'
        await repo.createThread(makeNewThread({ id: 't_aaa' as ThreadId, updatedAt: sameTime }))
        await repo.createThread(makeNewThread({ id: 't_zzz' as ThreadId, updatedAt: sameTime }))
        const result = await repo.listThreads({
          projectId: 'proj_test',
          sort: 'updatedAt',
          limit: 50,
        })
        expect(result.threads.map((t) => t.id)).toEqual(['t_zzz', 't_aaa'])
      })

      it('filters by status', async () => {
        const open = await repo.createThread(makeNewThread({ id: 't_open' as ThreadId }))
        const closed = await repo.createThread(makeNewThread({ id: 't_closed' as ThreadId }))
        await repo.setStatus(
          { projectId: 'proj_test' },
          closed.id,
          'resolved',
          '2026-05-02T00:00:00.000Z',
        )

        const onlyOpen = await repo.listThreads({
          projectId: 'proj_test',
          sort: 'updatedAt',
          limit: 50,
          status: 'open',
        })
        expect(onlyOpen.threads.map((t) => t.id)).toEqual([open.id])

        const onlyResolved = await repo.listThreads({
          projectId: 'proj_test',
          sort: 'updatedAt',
          limit: 50,
          status: 'resolved',
        })
        expect(onlyResolved.threads.map((t) => t.id)).toEqual([closed.id])
      })

      it('isolates scope between projects', async () => {
        await repo.createThread(makeNewThread({ projectId: 'proj_a' }))
        await repo.createThread(makeNewThread({ projectId: 'proj_b' }))
        const onlyA = await repo.listThreads({
          projectId: 'proj_a',
          sort: 'updatedAt',
          limit: 50,
        })
        expect(onlyA.threads).toHaveLength(1)
      })

      it('isolates env scope', async () => {
        await repo.createThread(makeNewThread({ projectId: 'proj_a', env: 'prod' }))
        const result = await repo.listThreads({
          projectId: 'proj_a',
          env: 'staging',
          sort: 'updatedAt',
          limit: 50,
        })
        expect(result.threads).toHaveLength(0)
      })

      it('projects the root comment text into rootComment', async () => {
        const input = makeNewThread({ firstComment: { text: 'the original' } })
        await repo.createThread(input)
        const result = await repo.listThreads({
          projectId: input.projectId,
          pageKey: input.pageKey ?? undefined,
          sort: 'updatedAt',
          limit: 50,
        })
        expect(result.threads[0]?.rootComment).toEqual({
          text: 'the original',
          createdAt: input.firstComment.createdAt,
        })
      })

      it('projects empty rootComment text for an attachment-only root', async () => {
        const input = makeNewThread({ firstComment: { text: '' } })
        await repo.createThread(input)
        const result = await repo.listThreads({
          projectId: input.projectId,
          pageKey: input.pageKey ?? undefined,
          sort: 'updatedAt',
          limit: 50,
        })
        expect(result.threads[0]?.rootComment?.text).toBe('')
      })

      it('keeps rootComment fixed to the first comment as replies are added', async () => {
        const input = makeNewThread({ firstComment: { text: 'first' } })
        await repo.createThread(input)
        await repo.addComment(
          { projectId: input.projectId },
          input.id,
          makeComment({ text: 'a reply' }),
        )
        const result = await repo.listThreads({
          projectId: input.projectId,
          pageKey: input.pageKey ?? undefined,
          sort: 'updatedAt',
          limit: 50,
        })
        expect(result.threads[0]?.rootComment?.text).toBe('first')
      })

      it('paginates with cursor: no overlap, no gap, nextCursor null on last page', async () => {
        for (let i = 0; i < 25; i++) {
          await repo.createThread(
            makeNewThread({
              id: `t_${String(i).padStart(2, '0')}` as ThreadId,
              updatedAt: new Date(2026, 0, 1, 0, 0, i).toISOString(),
            }),
          )
        }
        const seen = new Set<string>()
        let cursor: string | null = null
        let pages = 0
        for (;;) {
          const page = await repo.listThreads({
            projectId: 'proj_test',
            sort: 'updatedAt',
            limit: 10,
            cursor,
          })
          pages++
          for (const t of page.threads) {
            expect(seen.has(t.id)).toBe(false)
            seen.add(t.id)
          }
          cursor = page.nextCursor
          if (cursor === null) break
          expect(typeof cursor).toBe('string')
          expect(cursor.length).toBeGreaterThan(0)
        }
        expect(seen.size).toBe(25)
        expect(pages).toBe(3) // 10 + 10 + 5
      })
    })

    describe('addComment', () => {
      it('appends a comment and returns it', async () => {
        const input = makeNewThread()
        await repo.createThread(input)
        const newComment = makeComment({ text: 'reply' })
        const added = await repo.addComment({ projectId: input.projectId }, input.id, newComment)
        expect(added.id).toBe(newComment.id)
        const fetched = await repo.getThread({ projectId: input.projectId }, input.id)
        expect(fetched?.comments).toHaveLength(2)
      })

      it('updates updatedAt on the thread', async () => {
        const input = makeNewThread({ updatedAt: '2026-01-01T00:00:00.000Z' })
        await repo.createThread(input)
        const later = makeComment({ createdAt: '2026-06-01T00:00:00.000Z' })
        await repo.addComment({ projectId: input.projectId }, input.id, later)
        const fetched = await repo.getThread({ projectId: input.projectId }, input.id)
        expect(fetched?.updatedAt).toBe(later.createdAt)
      })
    })

    describe('setStatus', () => {
      it('round-trips open ↔ resolved and bumps updatedAt', async () => {
        const input = makeNewThread()
        await repo.createThread(input)
        const t1 = await repo.setStatus(
          { projectId: input.projectId },
          input.id,
          'resolved',
          '2026-06-01T00:00:00.000Z',
        )
        expect(t1.status).toBe('resolved')
        expect(t1.updatedAt).toBe('2026-06-01T00:00:00.000Z')
        const t2 = await repo.setStatus(
          { projectId: input.projectId },
          input.id,
          'open',
          '2026-06-02T00:00:00.000Z',
        )
        expect(t2.status).toBe('open')
        expect(t2.updatedAt).toBe('2026-06-02T00:00:00.000Z')
      })

      it('treats no-op setStatus as a no-op that still bumps updatedAt', async () => {
        const input = makeNewThread()
        await repo.createThread(input)
        const t = await repo.setStatus(
          { projectId: input.projectId },
          input.id,
          'open',
          '2026-06-01T00:00:00.000Z',
        )
        expect(t.status).toBe('open')
        expect(t.updatedAt).toBe('2026-06-01T00:00:00.000Z')
      })
    })

    describe('updateAnchor', () => {
      it('flips anchorState and persists a new fingerprint', async () => {
        const input = makeNewThread()
        await repo.createThread(input)
        const item = await repo.updateAnchor(
          { projectId: input.projectId },
          input.id,
          {
            anchorState: 'orphaned',
            selectors: ['main > h2', '.hero > .subtitle'] as [string, string],
            signals: {
              tag: 'h2',
              classes: ['subtitle'],
              siblingIndex: 1,
              ancestorTrail: ['main', 'section.hero'],
            },
          },
          '2026-06-03T00:00:00.000Z',
        )
        expect(item.anchorState).toBe('orphaned')
        expect(item.updatedAt).toBe('2026-06-03T00:00:00.000Z')

        const refetched = await repo.getThread({ projectId: input.projectId }, input.id)
        expect(refetched?.anchor.selectors).toEqual(['main > h2', '.hero > .subtitle'])
      })

      it('updateAnchor returns a ThreadListItem carrying rootComment', async () => {
        const input = makeNewThread({ firstComment: { text: 'anchored root' } })
        await repo.createThread(input)
        const item = await repo.updateAnchor(
          { projectId: input.projectId },
          input.id,
          { anchorState: 'orphaned' },
          '2026-05-28T11:00:00.000Z',
        )
        expect(item.rootComment?.text).toBe('anchored root')
      })

      it('persists selectionLost without flipping anchorState', async () => {
        const input = makeNewThread()
        await repo.createThread(input)
        const item = await repo.updateAnchor(
          { projectId: input.projectId },
          input.id,
          { anchorState: 'anchored', selectionLost: true },
          '2026-06-04T00:00:00.000Z',
        )
        expect(item.anchorState).toBe('anchored')
        expect(item.selectionLost).toBe(true)
      })
    })

    describe('upsertExternalLink', () => {
      it('appends a link and returns the updated thread', async () => {
        const input = makeNewThread()
        await repo.createThread(input)
        const link = makeExternalLink()
        const updated = await repo.upsertExternalLink(
          { projectId: input.projectId },
          input.id,
          link,
          '2026-06-05T00:00:00.000Z',
        )
        expect(updated.externalLinks).toEqual([link])
      })

      it('dedupes by provider — a second jira link replaces the first', async () => {
        const input = makeNewThread()
        await repo.createThread(input)
        await repo.upsertExternalLink(
          { projectId: input.projectId },
          input.id,
          makeExternalLink({ externalId: 'PROJ-1', key: 'PROJ-1', label: 'PROJ-1' }),
          '2026-06-05T00:00:00.000Z',
        )
        const updated = await repo.upsertExternalLink(
          { projectId: input.projectId },
          input.id,
          makeExternalLink({ externalId: 'PROJ-2', key: 'PROJ-2', label: 'PROJ-2' }),
          '2026-06-06T00:00:00.000Z',
        )
        expect(updated.externalLinks).toHaveLength(1)
        expect(updated.externalLinks?.[0]?.provider).toBe('jira')
        expect(updated.externalLinks?.[0]?.externalId).toBe('PROJ-2')
      })

      it('keeps links from different providers', async () => {
        const input = makeNewThread()
        await repo.createThread(input)
        await repo.upsertExternalLink(
          { projectId: input.projectId },
          input.id,
          makeExternalLink({ provider: 'jira' }),
          '2026-06-05T00:00:00.000Z',
        )
        const updated = await repo.upsertExternalLink(
          { projectId: input.projectId },
          input.id,
          makeExternalLink({
            provider: 'linear',
            externalId: 'LIN-1',
            key: 'LIN-1',
            label: 'LIN-1',
            url: 'https://linear.app/team/issue/LIN-1',
          }),
          '2026-06-06T00:00:00.000Z',
        )
        expect(updated.externalLinks?.map((l) => l.provider).sort()).toEqual(['jira', 'linear'])
      })

      it('bumps updatedAt to the passed now', async () => {
        const input = makeNewThread({ updatedAt: '2026-01-01T00:00:00.000Z' })
        await repo.createThread(input)
        const updated = await repo.upsertExternalLink(
          { projectId: input.projectId },
          input.id,
          makeExternalLink(),
          '2026-06-07T00:00:00.000Z',
        )
        expect(updated.updatedAt).toBe('2026-06-07T00:00:00.000Z')
      })

      it('rejects when scope does not match', async () => {
        const input = makeNewThread({ projectId: 'proj_a' })
        await repo.createThread(input)
        await expect(
          repo.upsertExternalLink(
            { projectId: 'proj_b' },
            input.id,
            makeExternalLink(),
            '2026-06-05T00:00:00.000Z',
          ),
        ).rejects.toThrow()
      })
    })

    describe('derived counts on list items', () => {
      it('tracks commentCount as comments are appended', async () => {
        const input = makeNewThread()
        await repo.createThread(input)
        await repo.addComment({ projectId: input.projectId }, input.id, makeComment())
        await repo.addComment({ projectId: input.projectId }, input.id, makeComment())
        const result = await repo.listThreads({
          projectId: input.projectId,
          pageKey: input.pageKey ?? undefined,
          sort: 'updatedAt',
          limit: 50,
        })
        expect(result.threads[0]?.commentCount).toBe(3)
      })

      it('drops unresolvedCount to 0 when status flips to resolved', async () => {
        const input = makeNewThread()
        const t = await repo.createThread(input)
        const before = await repo.listThreads({
          projectId: input.projectId,
          sort: 'updatedAt',
          limit: 50,
        })
        expect(before.threads[0]?.unresolvedCount).toBeGreaterThan(0)
        await repo.setStatus(
          { projectId: input.projectId },
          t.id,
          'resolved',
          '2026-06-01T00:00:00.000Z',
        )
        const after = await repo.listThreads({
          projectId: input.projectId,
          sort: 'updatedAt',
          limit: 50,
        })
        expect(after.threads[0]?.unresolvedCount).toBe(0)
      })
    })

    describe('scope mismatch', () => {
      it('addComment rejects when scope does not match', async () => {
        const input = makeNewThread({ projectId: 'proj_a' })
        await repo.createThread(input)
        await expect(
          repo.addComment({ projectId: 'proj_b' }, input.id, makeComment()),
        ).rejects.toThrow()
      })

      it('setStatus rejects when scope does not match', async () => {
        const input = makeNewThread({ projectId: 'proj_a' })
        await repo.createThread(input)
        await expect(
          repo.setStatus({ projectId: 'proj_b' }, input.id, 'resolved', '2026-06-01T00:00:00.000Z'),
        ).rejects.toThrow()
      })

      it('updateAnchor rejects when scope does not match', async () => {
        const input = makeNewThread({ projectId: 'proj_a' })
        await repo.createThread(input)
        await expect(
          repo.updateAnchor(
            { projectId: 'proj_b' },
            input.id,
            { anchorState: 'orphaned' },
            '2026-06-01T00:00:00.000Z',
          ),
        ).rejects.toThrow()
      })
    })

    describe('attachments', () => {
      it('persists an attachment and resolves it by id', async () => {
        const att = makeAttachment({ id: 'at_1' as AttachmentId })
        await repo.putAttachment({ projectId: 'proj_test' }, att)
        const found = await repo.getAttachments({ projectId: 'proj_test' }, [att.id])
        expect(found).toEqual([att])
      })

      it('resolves only the ids that exist (missing ids are omitted)', async () => {
        await repo.putAttachment(
          { projectId: 'proj_test' },
          makeAttachment({ id: 'at_1' as AttachmentId }),
        )
        const found = await repo.getAttachments({ projectId: 'proj_test' }, [
          'at_1' as AttachmentId,
          'at_nope' as AttachmentId,
        ])
        expect(found.map((a) => a.id)).toEqual(['at_1'])
      })

      it('returns [] for an empty id list', async () => {
        expect(await repo.getAttachments({ projectId: 'proj_test' }, [])).toEqual([])
      })

      it('isolates attachments by project scope', async () => {
        await repo.putAttachment(
          { projectId: 'proj_a' },
          makeAttachment({ id: 'at_1' as AttachmentId }),
        )
        const fromOther = await repo.getAttachments({ projectId: 'proj_b' }, [
          'at_1' as AttachmentId,
        ])
        expect(fromOther).toEqual([])
      })

      it('isolates attachments by env scope', async () => {
        await repo.putAttachment(
          { projectId: 'proj_a', env: 'prod' },
          makeAttachment({ id: 'at_1' as AttachmentId }),
        )
        const fromOther = await repo.getAttachments({ projectId: 'proj_a', env: 'staging' }, [
          'at_1' as AttachmentId,
        ])
        expect(fromOther).toEqual([])
      })
    })

    it('exposes schemaVersion on every persisted thread', async () => {
      const input = makeNewThread()
      const created = await repo.createThread(input)
      expect(created.schemaVersion).toBe(ANCHOR_SCHEMA_VERSION)
    })

    it('does not leak mutations through getThread', async () => {
      const input = makeNewThread()
      const created = await repo.createThread(input)
      created.pageUrl = 'https://attacker.example/'
      const refetched = await repo.getThread({ projectId: input.projectId }, input.id)
      expect(refetched?.pageUrl).toBe(input.pageUrl)
    })
  })
}
