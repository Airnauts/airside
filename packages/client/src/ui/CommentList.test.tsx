// packages/client/src/ui/CommentList.test.tsx
import type { Comment } from '@comments/core'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CommentList } from './CommentList'

const comment = (over: Partial<Comment> = {}): Comment =>
  ({
    id: 'c1',
    author: { email: 'a@b.c', name: 'Ann' },
    text: 'Sentence case please.',
    attachments: [],
    createdAt: new Date().toISOString(),
    ...over,
  }) as unknown as Comment

describe('CommentList', () => {
  it('renders a skeleton while loading', () => {
    render(<CommentList comments={[]} loading error={false} />)
    expect(screen.getByTestId('comments-skeleton')).toBeInTheDocument()
  })
  it('renders the empty state when there are no comments and not loading', () => {
    render(<CommentList comments={[]} loading={false} error={false} />)
    expect(screen.getByText(/start the thread/i)).toBeInTheDocument()
  })
  it('renders comments with author, text, and an image attachment', () => {
    render(
      <CommentList
        loading={false}
        error={false}
        comments={[
          comment({
            attachments: [
              {
                id: 'at1',
                url: 'https://x/y.png',
                name: 'shot.png',
                contentType: 'image/png',
                size: 1,
              } as never,
            ],
          }),
        ]}
      />,
    )
    expect(screen.getByText('Ann')).toBeInTheDocument()
    expect(screen.getByText('Sentence case please.')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'shot.png' })).toHaveAttribute('src', 'https://x/y.png')
  })
  it('renders an inline retry on error', () => {
    render(<CommentList comments={[]} loading={false} error onRetry={() => {}} />)
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })
})
