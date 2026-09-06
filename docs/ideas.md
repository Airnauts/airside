# Ideas parking lot

Planned and under-consideration improvements for Airside. Nothing here is a committed release; it is a living list of directions the project may take, prioritised by the needs of real integrations.

See the [root README Roadmap](../README.md#roadmap) for the curated short-list shown to the public. Add items here when they are too speculative or detailed for the top-level README.

---

## Widget & UX

- **Per-comment overflow menu** — edit / delete / copy a comment. Needs new `PATCH`/`DELETE` comment endpoints in the server and adapter layer.
- **Emoji reactions on comments** — a `+1` / heart / etc. reaction strip per comment. Requires a new `reactions` field on `Comment`, add/remove-reaction endpoints, and adapter support in both Mongo and Postgres.
- **Smooth, document-anchored pin positioning** — replace the per-scroll-frame layout pass with a CSS-anchored or IntersectionObserver-backed approach for jank-free pin rendering. A positioning-basis change that would get its own ADR.
- **In-widget changelog popup** — a small popover surfacing recent Airside user-facing changes to reviewers (useful when the operator upgrades the widget mid-project).
- **Page-level / unanchored comments** — start a thread without placing an element pin, for general page feedback. The `scope: "page"` seam is already designed in the data model and architecture; the widget UI and server routes need extending.
- **Rich-text / Markdown comment bodies** — allow headings, bold, bullet lists, and inline code in comments.
- **`@mentions` and thread assignment** — notify a named reviewer and optionally assign a thread for resolution tracking.
- **Accessibility & keyboard-navigation pass** — full keyboard control of pin placement, thread popover, and panel navigation. Widget UI localisation (i18n) for non-English product teams.

## Real-time & collaboration

- **Live updates (SSE / WebSocket)** — push new comments and threads to open widgets instead of refetch-on-focus, so multiple reviewers see each other's comments in real time.
- **Authenticated reviewer identity** — map commenters to real user accounts / SSO (OAuth, SAML) instead of a self-asserted email, so teams can trust authorship and gate access.

## Integrations & extensions

- **Jira comment sync** — mirror later thread replies into a linked Jira issue comment, keeping the Jira ticket up to date as reviewers reply. Needs `externalLinks` on the `NotificationEvent` shape.
- **Linear thread-action extension** — "Create Linear issue" alongside the existing Jira and GitHub integrations.
- **More notifiers** — Discord (Webhook), Microsoft Teams (Adaptive Cards), generic outbound webhook for custom integrations.

## Adapters & hosts

- **More persistence adapters** — SQLite (via `better-sqlite3` or `libsql`), MySQL / PlanetScale.
- **More host-framework glue** — Remix, SvelteKit, Astro route handlers, and a generic fetch-native handler that any Hono / Express / `http` host can adopt directly.

## Managed cloud

- **Hosted cloud version** — a subscription-based, fully-managed offering for teams that want the review workflow without running their own server, database, or blob storage. Self-hosting the open-source packages stays free and first-class.
