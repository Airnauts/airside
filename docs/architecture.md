> **Superseded by [`docs/superpowers/specs/2026-05-27-architecture-design.md`](superpowers/specs/2026-05-27-architecture-design.md)** (and ADR-0001…0009 in [`adr.md`](adr.md)). This early wish-list is kept for historical context only. Where it differs from the spec, the spec wins — most notably: v1 is **MongoDB-only** (ADR-0003), not multi-database; "database adapters (nextjs/react/spa)" actually means **framework integration adapters**; and **auth is out of scope for v1** (PRD §2).

desired specification - draft:

- published as an npm package
- our goal is to make it framework agnostic
- we should support different database adapters (nextjs, react app, any spa app etc)
- we should support different storage adapters (filesystem, s3)
- we should support different databases (postgres, mongodb, etc..)
- written in React, typescript, and Node for API/backend
- we should support different Authentication methods (just magic link, google auth)
- we should be able to enable/disable features though initial subpackages imports (treeshaking, bundle size)
