import { SiteNav } from '../components/site-nav'

export default function ArticlePage() {
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '2rem 1rem', lineHeight: 1.6 }}>
      <SiteNav />
      <article>
        <h1>Designing for durable anchors</h1>
        <p>
          An anchor is a promise: this comment belongs <em>here</em>, and it should still belong
          here after the page changes. Honoring that promise is the whole game.
        </p>
        <h2>Selectors are not enough</h2>
        <p>
          A CSS selector breaks the moment a wrapper appears or a class is renamed. Durable
          anchoring blends structural selectors with content signals and a quote of the surrounding
          text, then scores candidates when the fast path misses.
        </p>
        <ul>
          <li>Structural selectors locate likely candidates quickly.</li>
          <li>Content signals (tag, text, attributes) disambiguate near-matches.</li>
          <li>A quote with prefix and suffix re-finds selected text after edits.</li>
        </ul>
        <h2>When to orphan</h2>
        <p>
          If nothing scores above threshold, the anchor is orphaned rather than placed wrongly. A
          confidently wrong pin is worse than an honest &quot;needs review.&quot;
        </p>
      </article>
    </main>
  )
}
