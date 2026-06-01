import { SiteNav } from './components/site-nav'

export default function HomePage() {
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '2rem 1rem', lineHeight: 1.6 }}>
      <SiteNav />
      <h1>Acme Widgets</h1>
      <p id="hero-tagline">
        The fastest way to put comments on any page. Open this site with
        <code> ?comments-key=dev-key </code> to try the widget.
      </p>
      <section>
        <h2>Why teams pick Acme</h2>
        <p>
          Drop one component into your layout and one route into your API. No iframes, no rewrites,
          no lock-in. Place a pin on any element and it survives redeploys.
        </p>
        <img
          src="https://placehold.co/600x300/png"
          alt="Product screenshot placeholder"
          width={600}
          height={300}
        />
      </section>
      <section>
        <h2>How it works</h2>
        <p>
          Select some text or click an element, leave a comment, and reload — the comment re-anchors
          to the same spot.
        </p>
      </section>
    </main>
  )
}
