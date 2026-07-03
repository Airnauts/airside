import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  AttachIcon,
  CheckIcon,
  CloseIcon,
  ExternalLinkIcon,
  type IconComponent,
  MoreIcon,
  ReopenIcon,
  resolveIcon,
  SpinnerIcon,
} from './index'

const ICONS: Array<[string, IconComponent]> = [
  ['CheckIcon', CheckIcon],
  ['CloseIcon', CloseIcon],
  ['MoreIcon', MoreIcon],
  ['AttachIcon', AttachIcon],
  ['ExternalLinkIcon', ExternalLinkIcon],
  ['ReopenIcon', ReopenIcon],
]

describe('icons', () => {
  it.each(ICONS)('%s renders a currentColor svg, decorative by default', (_name, IconCmp) => {
    const { container } = render(<IconCmp />)
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    // decorative: hidden from AT, not focusable, no accessible name
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg).toHaveAttribute('focusable', 'false')
    expect(svg).not.toHaveAttribute('role', 'img')
    // themed via currentColor so it inherits the parent's colour + state
    expect(svg?.getAttribute('stroke')).toBe('currentColor')
  })

  it.each(ICONS)('%s honours an explicit px size on both dimensions', (_name, IconCmp) => {
    const { container } = render(<IconCmp size={24} />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('width', '24')
    expect(svg).toHaveAttribute('height', '24')
  })

  it('defaults to a 16px square', () => {
    const { container } = render(<CheckIcon />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('width', '16')
    expect(svg).toHaveAttribute('height', '16')
  })

  it('exposes a labelled, non-decorative icon when a title is passed', () => {
    const { container, getByTitle } = render(<CheckIcon title="Done" />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('role', 'img')
    expect(svg).not.toHaveAttribute('aria-hidden')
    expect(getByTitle('Done')).toBeInTheDocument()
  })

  it('SpinnerIcon renders a decorative, currentColor-bordered spinner sized in px', () => {
    const { container } = render(<SpinnerIcon size={14} />)
    const el = container.firstElementChild as HTMLElement
    expect(el).toHaveAttribute('aria-hidden', 'true')
    expect(el.className).toContain('air:animate-spin')
    expect(el.className).toContain('air:border-current')
    expect(el.style.width).toBe('14px')
    expect(el.style.height).toBe('14px')
  })

  describe('resolveIcon', () => {
    it('resolves a known name to its icon component', () => {
      expect(resolveIcon('check')).toBe(CheckIcon)
      expect(resolveIcon('external-link')).toBe(ExternalLinkIcon)
      expect(resolveIcon('reopen')).toBe(ReopenIcon)
    })

    it('resolves an unknown or absent name to null (never a raw glyph)', () => {
      expect(resolveIcon('🎫')).toBeNull()
      expect(resolveIcon('not-an-icon')).toBeNull()
      expect(resolveIcon(undefined)).toBeNull()
      expect(resolveIcon('')).toBeNull()
    })
  })
})
