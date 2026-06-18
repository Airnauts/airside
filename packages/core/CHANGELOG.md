# @airnauts/airside-core

## 0.9.1

## 0.9.0

## 0.8.2

## 0.8.1

### Patch Changes

- 4404855: Add the Airside logo and "Embeddable Commenting Tool" tagline as a centered, dark/light-aware header to the package README.

## 0.8.0

### Minor Changes

- Rebrand: the package family is now published as `@airnauts/airside-*` (Airside). This is a breaking change — update your imports and: the React prop `airsideKey` (was `commentsKey`), URL params `?airside-key` / `?airside-thread`, the `x-airside-key` request header, `AIRSIDE_*` env vars, and (if you target the widget DOM) the `air:` CSS class prefix and `data-airside-*` attributes. The Slack/email/Jira integrations are now `@airnauts/airside-extension-{slack,email,jira}`. The former `@airnauts/comments-*` packages are deprecated with a pointer to their replacements.

### Patch Changes

- 402b2c4: Docs: corrected `scoreCandidate`, `decide`, and `locateQuote` signatures in the README — parameter order, return types, and descriptions now match the source.

## 0.7.0

## 0.6.0

### Minor Changes

- 3f4bcb1: Export `threadLink()` and `DEFAULT_THREAD_PARAM` — the single source of truth for thread
  deep-link URLs, shared by the widget and server-side notifiers.
- bf41997: Threads can now carry `externalLinks` (e.g. a created Jira issue) and thread read responses
  include an evaluated `actions` array describing the server-side actions a reviewer can run on the
  thread. Adds the contract for the generic thread-action endpoint
  (`POST /threads/:id/actions/:actionId`).
- 54bbab0: `pageUrl` is now restricted to `http(s)` schemes on both the create-thread request and the
  `Thread` schema. This rejects `javascript:`, `data:`, and similar active schemes so a link built
  from `pageUrl` server-side (notification deep-links) can never carry one. Browser hosts are
  unaffected (`window.location.href` is always http(s)).

### Patch Changes

- 79fe6ba: Export `unresolvedCountOf(status)` — the domain policy mapping a thread status to
  its `unresolvedCount` contribution — so repository adapters share one definition.
- e9cc0e9: Docs: README updated to match the current public API.

## 0.5.1

## 0.5.0

## 0.4.0

### Minor Changes

- All `@airnauts/comments-*` packages now share a single, synchronized version line
  (starting at 0.4.0) and are released together. Adopters can pin one version across
  the whole set instead of reconciling per-package versions.

## 0.2.0

### Minor Changes

- ab680eb: Thread list items now include a `rootComment` preview (the first comment's text and
  timestamp), so list UIs can show what a thread is about without fetching the full thread.

## 0.1.0

### Minor Changes

- 8f30bb1: Initial public release of the Airnauts embeddable commenting tool.
- initial release
