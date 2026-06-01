import Link from 'next/link'

export function SiteNav() {
  return (
    <nav aria-label="Site" style={{ display: 'flex', gap: '1rem', padding: '1rem 0' }}>
      <Link href="/">Home</Link>
      <Link href="/article">Article</Link>
      <Link href="/pricing">Pricing</Link>
    </nav>
  )
}
