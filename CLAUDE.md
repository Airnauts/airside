# CLAUDE.md

This project is an **embeddable commenting tool** (v1). The repository currently
holds the design; application code is built against that spec. The design is the
source of truth — read it before implementing, and point to it rather than
restating it here:

- `docs/prd.md` — product requirements.
- `docs/architecture.md` — the integrated v1 system architecture (start here).
- `docs/adr.md` — the per-decision rationale log (ADR-0001…).
- `docs/milestones.md` — delivery milestones.

## Development practices

### Backend is built test-first (TDD)

The backend packages — `core`, `server`, and the persistence/storage adapters
(see architecture §2) — are built **test-first** (ADR-0010): write the failing
test or fixture before the implementation it covers, then red → green → refactor.
In particular, `core`'s pure logic (zod schemas, `pageKey` normalization, the
scoring/threshold policy) and the shared adapter contract suite are authored as the
executable spec first. Client/widget testing follows architecture §9, not strict TDD.

## Architecture decision records

`docs/adr.md` is the running log of architecture decisions for this project. Whenever an architecturally significant choice is made or changed.

### When to add an ADR

Add an ADR when a decision is difficult to change later. Specifically, write one when you:

- Choose a framework, language, or database.
- Define communication protocols (e.g., REST vs. gRPC).
- Establish coding standards or architectural patterns.
- Introduce a change with significant trade-offs.

### What each record captures

Keep entries newest-last, and for each record capture:

- **Title and date** (use the current date).
- **Status** — proposed / accepted / superseded (note which record supersedes it).
- **Context** — the problem and the forces in play.
- **Decision** — what was chosen.
- **Consequences** — trade-offs and follow-on implications.

Don't edit decided history in place: to reverse a past decision, add a new record that supersedes the old one rather than rewriting it.
