import { describe, expect, it } from 'vitest'
import { Attachment, Author, Comment } from './comment'

describe('comment schemas', () => {
  it('parses an author (id optional)', () => {
    expect(Author.parse({ email: 'a@b.com' }).email).toBe('a@b.com')
    expect(Author.parse({ id: 'auth1', email: 'a@b.com', name: 'A' }).name).toBe('A')
  })
  it('parses an attachment', () => {
    const a = {
      id: 'img1',
      url: 'https://cdn/x.png',
      name: 'x.png',
      contentType: 'image/png',
      size: 1024,
    }
    expect(Attachment.parse(a).contentType).toBe('image/png')
  })
  it('parses a comment with no attachments', () => {
    const c = {
      id: 'c1',
      author: { email: 'a@b.com' },
      text: 'cz',
      attachments: [],
      createdAt: '2026-05-27T11:47:26.611Z',
    }
    expect(Comment.parse(c).text).toBe('cz')
  })
})
