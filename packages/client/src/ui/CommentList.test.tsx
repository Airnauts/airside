// packages/client/src/ui/CommentList.test.tsx
import type { Comment } from '@airnauts/comments-core'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
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
    // The attachment opens its raw URL in a new tab (with safe rel).
    const link = screen.getByRole('link', { name: /open shot\.png in a new tab/i })
    expect(link).toHaveAttribute('href', 'https://x/y.png')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })
  it('renders an inline retry on error', () => {
    render(<CommentList comments={[]} loading={false} error onRetry={() => {}} />)
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })
  it('calls onRetry when the retry button is clicked', () => {
    const onRetry = vi.fn()
    render(<CommentList comments={[]} loading={false} error onRetry={onRetry} />)
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('renders a relative time for a comment', () => {
    render(<CommentList loading={false} error={false} comments={[comment()]} />)
    expect(screen.getByText(/just now|ago|^\d+[mhd]$/i)).toBeInTheDocument()
  })

  it('scrolls the list to the bottom when a new comment is added', () => {
    const { rerender } = render(
      <CommentList loading={false} error={false} comments={[comment({ id: 'c1' })]} />,
    )
    const list = screen.getByTestId('comment-list-scroll')
    // jsdom has no layout — fake a scrollable height so scrollTop has somewhere to go.
    Object.defineProperty(list, 'scrollHeight', { value: 500, configurable: true })
    list.scrollTop = 0

    rerender(
      <CommentList
        loading={false}
        error={false}
        comments={[comment({ id: 'c1' }), comment({ id: 'c2', text: 'A reply.' })]}
      />,
    )

    expect(list.scrollTop).toBe(500)
  })
})
