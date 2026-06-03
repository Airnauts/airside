import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LoginLauncher } from './LoginLauncher'

describe('LoginLauncher', () => {
  it('renders a Log In button and calls onLogIn when clicked', () => {
    const onLogIn = vi.fn()
    render(<LoginLauncher onLogIn={onLogIn} />)
    const btn = screen.getByTestId('comments-login')
    expect(btn).toHaveAccessibleName('Log in')
    fireEvent.click(btn)
    expect(onLogIn).toHaveBeenCalledOnce()
  })
})
