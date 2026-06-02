import { SiteNav } from '../components/site-nav'

// Test-support only (M10 e2e): ?variant mutates the DOM at render time so a reload can
// exercise re-anchor (reordered/renamed/wrapped) and orphan (removed). Not a product feature.
type Variant = 'reordered' | 'renamed' | 'wrapped' | 'removed'
const VARIANTS: Variant[] = ['reordered', 'renamed', 'wrapped', 'removed']

function asVariant(v: string | string[] | undefined): Variant | undefined {
  const s = Array.isArray(v) ? v[0] : v
  return VARIANTS.includes(s as Variant) ? (s as Variant) : undefined
}

const ITEMS = [
  'Structural selectors locate likely candidates quickly.',
  'Content signals (tag, text, attributes) disambiguate near-matches.',
  'A quote with prefix and suffix re-finds selected text after edits.',
]

export default async function ArticlePage({
  searchParams,
}: {
  searchParams: Promise<{ variant?: string | string[] }>
}) {
  const variant = asVariant((await searchParams).variant)

  // The mutation anchor target is the SECOND list item. Build the <ul> per variant.
  const items = variant === 'reordered' ? [...ITEMS].reverse() : ITEMS
  const list = (
    <ul className={variant === 'renamed' ? 'mutated-list' : undefined}>
      {items.map((text) =>
        variant === 'removed' && text === ITEMS[1] ? null : <li key={text}>{text}</li>,
      )}
    </ul>
  )

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '2rem 1rem', lineHeight: 1.6 }}>
      <SiteNav />
      <article>
        <h1>Designing for durable anchors</h1>
        <p>
          An anchor is a promise: this comment belongs <em>here</em>, and it should still belong
          here after the page changes. Honoring that promise is the whole game.
        </p>
        <h2>{variant === 'renamed' ? 'Selectors alone fall short' : 'Selectors are not enough'}</h2>
        <p>
          A CSS selector breaks the moment a wrapper appears or a class is renamed. Durable
          anchoring blends structural selectors with content signals and a quote of the surrounding
          text, then scores candidates when the fast path misses.
        </p>
        {variant === 'wrapped' ? <div className="extra-wrapper">{list}</div> : list}
        <h2>When to orphan</h2>
        <p>
          If nothing scores above threshold, the anchor is orphaned rather than placed wrongly. A
          confidently wrong pin is worse than an honest &quot;needs review.&quot;
        </p>
      </article>
    </main>
  )
}
