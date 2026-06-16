import type { Attachment } from '@airnauts/airside-core'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DraftsProvider, useDraft } from './DraftsProvider'

const ATT = {
  id: 'a1',
  url: 'https://x/y.png',
  name: 'y.png',
  contentType: 'image/png',
  size: 1,
} as Attachment

function Surface({ id, label }: { id: string; label: string }) {
  const { draft, setText, setAttachment, clear } = useDraft(id)
  return (
    <div>
      <span data-testid={`${label}-text`}>{draft.text}</span>
      <span data-testid={`${label}-att`}>{draft.attachment?.id ?? 'none'}</span>
      <button type="button" onClick={() => setText(`hi from ${label}`)}>{`type-${label}`}</button>
      <button type="button" onClick={() => setAttachment(ATT)}>{`attach-${label}`}</button>
      <button type="button" onClick={clear}>{`clear-${label}`}</button>
    </div>
  )
}

describe('drafts slice', () => {
  it('mirrors text and attachment between two surfaces on the same thread', () => {
    render(
      <DraftsProvider>
        <Surface id="t1" label="a" />
        <Surface id="t1" label="b" />
      </DraftsProvider>,
    )
    fireEvent.click(screen.getByText('type-a'))
    expect(screen.getByTestId('b-text').textContent).toBe('hi from a')
    fireEvent.click(screen.getByText('attach-b'))
    expect(screen.getByTestId('a-att').textContent).toBe('a1')
  })

  it('clear empties text and attachment for that thread only', () => {
    render(
      <DraftsProvider>
        <Surface id="t1" label="a" />
        <Surface id="t2" label="c" />
      </DraftsProvider>,
    )
    fireEvent.click(screen.getByText('type-a'))
    fireEvent.click(screen.getByText('type-c'))
    fireEvent.click(screen.getByText('clear-a'))
    expect(screen.getByTestId('a-text').textContent).toBe('')
    expect(screen.getByTestId('c-text').textContent).toBe('hi from c')
  })
})
