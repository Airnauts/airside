// packages/client/src/whatsnew/highlights.ts

/** One release's hand-curated "what's new" entry, written for reviewers (not package
 *  adopters — the generated `CHANGELOG.md` files stay the adopter-facing record). */
export type Highlight = {
  /** The release version this entry announces, e.g. `'0.10.2'`. */
  version: string
  /** The release date, `YYYY-MM-DD`. */
  date: string
  /** A short headline for the release. */
  title: string
  /** Reviewer-facing bullet points — what changed, in plain language. */
  items: string[]
}

/**
 * Editorial release highlights, **newest first**. The first entry's version doubles as the
 * "latest announced version" — the array ships inside the versioned bundle, so no build-time
 * version constant is needed (a running build can never contain an entry newer than itself).
 *
 * Release step (see `RELEASING.md`): when cutting a release with user-facing changes, prepend
 * an entry here for the new version. The invariant test (`highlights.test.ts`) enforces the
 * newest-first ordering and entry shape.
 */
export const HIGHLIGHTS: Highlight[] = [
  {
    version: '0.10.2',
    date: '2026-07-03',
    title: 'What’s new, right in the widget',
    items: [
      'The widget now tells you what changed: release highlights pop up once per new version.',
      'Reopen them anytime with the ✦ button in the comments panel header.',
    ],
  },
]
