# CLAUDE.md

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
