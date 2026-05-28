import { describe, expect, it } from 'vitest'
import { makeNewThread } from './fixtures'

describe('fixtures', () => {
  it('makeNewThread accepts a partial firstComment override (text only)', () => {
    const t = makeNewThread({ firstComment: { text: 'hello override' } })
    expect(t.firstComment.text).toBe('hello override')
    expect(t.firstComment.author.email).toBe('alice@example.com')
  })
})
