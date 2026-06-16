import { Attachment } from '@airnauts/airside-core'
import { describe, expect, it } from 'vitest'
import { makeAttachment, makeNewThread } from './fixtures'

describe('fixtures', () => {
  it('makeNewThread accepts a partial firstComment override (text only)', () => {
    const t = makeNewThread({ firstComment: { text: 'hello override' } })
    expect(t.firstComment.text).toBe('hello override')
    expect(t.firstComment.author.email).toBe('alice@example.com')
  })

  it('makeAttachment builds a schema-valid Attachment with unique ids', () => {
    const a = makeAttachment()
    const b = makeAttachment()
    expect(Attachment.parse(a)).toEqual(a)
    expect(a.id).not.toBe(b.id)
  })

  it('makeAttachment applies overrides', () => {
    const a = makeAttachment({ name: 'shot.png', size: 42 })
    expect(a.name).toBe('shot.png')
    expect(a.size).toBe(42)
  })
})
