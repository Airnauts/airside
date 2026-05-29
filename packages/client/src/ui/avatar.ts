// packages/client/src/ui/avatar.ts
import type { Author } from '@comments/core'

export function initials(author: Author): string {
  const name = author.name?.trim()
  if (name) {
    const parts = name.split(/\s+/)
    if (parts.length >= 2)
      return ((parts[0]?.[0] ?? '') + (parts[parts.length - 1]?.[0] ?? '')).toUpperCase()
    return (parts[0]?.slice(0, 1) ?? '').toUpperCase()
  }
  return (author.email.split('@')[0] || '?').slice(0, 2).toUpperCase()
}

export function avatarColor(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360
  return `hsl(${h}, 55%, 45%)`
}
