import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

describe('test environment', () => {
  it('renders JSX and finds it via RTL', () => {
    render(<div>hello m5</div>)
    expect(screen.getByText('hello m5')).toBeInTheDocument()
  })
})
