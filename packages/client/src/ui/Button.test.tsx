import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Button } from './Button'

describe('Button', () => {
  it('defaults to type="button"', () => {
    render(
      <Button variant="primary" size="sm">
        Go
      </Button>,
    )
    expect(screen.getByRole('button', { name: 'Go' })).toHaveAttribute('type', 'button')
  })

  it('applies the variant and size class sets', () => {
    render(
      <Button variant="primary" size="md">
        Go
      </Button>,
    )
    const cls = screen.getByRole('button').className
    expect(cls).toContain('cmnt:bg-blue-600') // primary
    expect(cls).toContain('cmnt:text-white') // primary
    expect(cls).toContain('cmnt:rounded-full') // md
    expect(cls).toContain('cmnt:px-4') // md
    expect(cls).toContain('cmnt:font-semibold') // base
  })

  it('merges className and lets it win on a conflicting utility', () => {
    render(
      <Button variant="primary" size="sm" className="cmnt:bg-blue-800">
        Go
      </Button>,
    )
    const cls = screen.getByRole('button').className
    expect(cls).toContain('cmnt:bg-blue-800')
    expect(cls).not.toContain('cmnt:bg-blue-600') // tailwind-merge drops the variant default
  })

  it('passes through onClick, disabled, aria-*, and data-*', () => {
    const onClick = vi.fn()
    render(
      <Button
        variant="ghost"
        size="icon"
        onClick={onClick}
        disabled
        aria-label="Close"
        data-testid="x"
      />,
    )
    const btn = screen.getByTestId('x')
    expect(btn).toBeDisabled()
    expect(btn).toHaveAttribute('aria-label', 'Close')
    expect(btn.className).toContain('cmnt:bg-transparent') // ghost
    expect(btn.className).toContain('cmnt:w-7') // icon
  })

  it('fires onClick when clicked', () => {
    const onClick = vi.fn()
    render(
      <Button variant="primary" size="sm" onClick={onClick}>
        Go
      </Button>,
    )
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('honors an explicit type override', () => {
    render(
      <Button variant="outline" size="sm" type="submit">
        Submit
      </Button>,
    )
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit')
  })
})
