# PRD — Embeddable Commenting Tool (v1)

- **Status:** Draft
- **Date:** 2026-05-27
- **Scope of this document:** Product requirements only. Architecture, stack, and implementation are intentionally excluded and handled in a separate follow-up step.

---

## 1. Problem & Context

Teams reviewing staging and preview builds need to leave precise, contextual feedback *on the page itself* — not in spreadsheets, chat threads, or screenshots annotated with arrows. The friction of describing "the button in the top-right of the pricing section" loses information and slows the review loop.

Vercel Comments solves this well, but only for apps deployed on Vercel and within its plan and per-seat limits. Teams hosting elsewhere (AWS, Netlify, self-hosted, any SPA), or who want account-free reviewer access, have no drop-in equivalent.

This product is an embeddable commenting layer that lets a team collect contextual visual feedback directly on their web app's pages — anchored to the elements being discussed — regardless of where the app is hosted.

## 2. Goals & Non-Goals

**Goals**

- **Easy integration** — a developer can add the tool to an app in minutes with minimal configuration.
- **Functional acceptance** — comments anchor correctly, persist and re-anchor across builds, and the full v1 feature set works reliably across the target web apps.
- **Dogfooding replacement** — our own team uses it on real projects in place of Vercel Comments.

**Non-Goals (v1)**

- Email notifications (and any outbound email at all).
- @mentions, emoji reactions, markdown formatting.
- Slack integration.
- Browser extension.
- Email verification / magic-link authentication.
- User accounts, roles, or permission tiers.
- Public, no-key (open to anyone) access.
- Drag-to-capture screenshots.
- Mobile-first review experience.
- Real-time presence / live multiplayer cursors.

## 3. Value Proposition (v1)

- **Platform independence** — works on any host and framework; not tied to Vercel deployments.
- **No per-seat lock-in / cost** — invite as many reviewers as you want, with no plan limits.
- **Frictionless, account-free access** — share a link; reviewers just type their email to start commenting. No sign-up, no invitations to manage.

*Longer-term direction (not v1): magic-link verified identity — keeping the low friction while adding trusted identity.*

## 4. Target Users (two personas)

- **Integrator (developer).** Installs the package into their app, configures the secret key, and ships a build. Cares about fast, low-config setup and not having to think about it again.
- **Reviewer / Commenter (team member or external stakeholder).** Opens the shared link, leaves feedback, and responds in threads. Cares about zero friction — no account, no install, just open and comment.

## 5. Key User Stories

- As an **integrator**, I add the package and set a secret key, so the comment layer loads only when that key is present in the URL.
- As a **reviewer**, I open the shared link and enter my email, so I can be identified as the author of my comments.
- As a **reviewer**, I click a spot on the page and leave a comment pinned to that element.
- As a **reviewer**, I attach a screenshot to a comment to make my feedback clearer.
- As a **reviewer**, I reply within a thread to keep a discussion in one place.
- As a **reviewer**, I resolve a thread once the feedback has been addressed.
- As a **reviewer**, I open a comments panel listing threads across *all* pages and jump to any one of them.
- As a **reviewer**, after a redeploy I still see open threads re-anchored to their elements, so I can verify fixes against the original feedback.

## 6. Functional Requirements (behavior level)

### 6.1 Access & identity

- The comment layer activates **only when a valid secret key is present in the URL** (the key is configured by the integrator). Without the key, the app behaves normally and no commenting UI appears.
- A first-time commenter enters a **self-asserted email address**. There is **no verification** and the email is **never sent to** — the app sends no email of any kind in v1. The email serves purely as the author label and as a stable identifier for future features (e.g. notifications) when they are added.
- The email is **remembered on the device** so repeat visits skip re-entry.
- There are **no accounts, roles, or permissions** in v1.

### 6.2 Placing & anchoring comments

- A reviewer **clicks anywhere on the page** to drop a comment pin, anchored to the underlying element at that location.
- Each pin records the **page URL** it was created on.
- Threads **persist and re-anchor across builds**: a thread created on one deployment still appears on later deployments, re-attached to the same element, so issues can be verified and resolved after a fix ships.
- If the anchored element **cannot be found** after a layout change or redeploy, the pin is marked **"orphaned / needs review"** and surfaced in the comments panel rather than silently dropped.

### 6.3 Threads & replies

- Each pin opens a **thread**. Participants can post **plain-text replies** (no markdown, mentions, or emoji in v1) to keep a discussion attached to its location.

### 6.4 Screenshots

- A reviewer can attach a screenshot to a comment by **uploading an image file**.
- *Capturing the current page automatically is desired but is an open question pending feasibility (see §9); v1 commits to upload only.*

### 6.5 Resolve

- Any participant can **resolve a thread** once feedback is addressed.
- Resolved threads are **hidden by default** and revealed via a **"show resolved" toggle**, so open work stands out and clutter is reduced.

### 6.6 Comments panel (cross-page) — primary discovery surface

Because v1 has no notifications, the comments panel is the **sole way reviewers learn about new and updated threads**. It must therefore make "what's here and what changed?" answerable at a glance.

- The panel lists threads **across all pages**, showing the **page URL**, thread **status** (open / resolved), and an **unresolved count**.
- Threads are ordered to surface activity (e.g. **most recently updated first**), so new replies and threads are easy to find.
- Clicking a thread **navigates to its page and focuses the pin**.
- The panel can **filter by open / resolved**.

*(No email notifications in v1 — see §2.)*

## 7. Success Criteria

- **Time-to-integrate** is measured in minutes.
- Comments **reliably re-anchor** across repeated redeploys.
- Our team **adopts it for at least one real project** and stops using Vercel Comments for that work.

## 8. Out of Scope / Future Roadmap

Deferred beyond v1, roughly in order of likely value:

- **Email notifications** for thread activity (the reason email is collected as identity now).
- **Magic-link verified identity** and "remember me" — frictionless but trusted auth.
- **@mentions, emoji reactions, markdown** formatting in comments.
- **Slack integration** for linked discussions.
- **Browser extension** — enables richer screenshot capture and an always-on toolbar.
- **Full Inbox** with a notification center and richer filters.
- **Roles / permissions** and **public access** modes.

## 9. Assumptions & Open Questions

- **Screenshot page-capture without a browser extension** — needs feasibility validation. v1 commits to **upload only** unless automatic capture proves cheap to deliver.
- **No notification mechanism in v1** — reviewers discover activity by opening the app and checking the comments panel; this is acceptable for the dogfooding stage but is the first thing to revisit post-v1.
- **Anchoring fidelity on highly dynamic DOM** — orphan handling is defined (§6.2); the tolerance for re-anchoring across significant markup changes still needs validation.
- **Desktop-browser review is assumed**; mobile is not a v1 target.
