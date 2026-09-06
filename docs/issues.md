# Known issues & rough edges

Bugs and limitations in shipped behaviour that are tracked but not yet fixed. These are real, reproducible rough edges — not feature requests (those live in [`ideas.md`](ideas.md)).

Entries are removed when the fix ships. See the [root README Roadmap](../README.md#roadmap) for the short list shown to the public.

---

## Anchoring

- **Silent sibling migration on structural removal** — a pin placed on a plain structural element (e.g. a `<div>` with no `id`, class, or `data-*` attributes) can silently re-anchor to the wrong surviving sibling after the original element is removed from the DOM. The anchor's scored re-match accepts the wrong sibling when scores are close. TDD fix deferred.

- **Signal-less elements always orphan under mutation** — elements with no stable attributes (`id`, `data-*`), no semantic class, and no ARIA role cannot accumulate enough signal weight to clear the re-anchor acceptance threshold after structural changes, so they always report as orphaned. A known v1 scoring limitation; improving scoring for signal-poor elements is a future anchor engine improvement.

## Adapters & build

- **MongoDB adapter emits a cosmetic `aws4` webpack warning** — when `@airnauts/airside-adapter-mongo` is bundled by Next.js, the MongoDB driver's optional `aws4` import triggers a build warning (`Module not found: Can't resolve 'aws4'`). The build succeeds and the runtime is unaffected (the `aws4`-dependent AWS auth path is never exercised in the adapter). Fix is a lazy-import refactor inside the adapter; deferred.
