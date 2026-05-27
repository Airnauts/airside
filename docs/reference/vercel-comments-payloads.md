# Reference — Vercel Comments telemetry payloads

> **What these are:** analytics/telemetry events captured from Vercel Comments
> in the wild (project `lear-e-catalog`, preview deployment), provided as
> reference on 2026-05-27. **These are event-tracking payloads, not Vercel's
> persistence/API schema** — treat them as hints about which fields matter, not
> as a storage contract to copy.

## Captured events

### `FEEDBACK_COMMENT_THREAD_CREATED` — "Created a new comment thread"

```json
{
  "identity": "17791146925030.3085562194074899",
  "event": "Created a new comment thread",
  "timestamp": "2026-05-27T11:47:26.611Z",
  "properties": {
    "stable_id": "Rd4L-_-W2LXY0ATz_OylL",
    "event_time": 1779882446611,
    "event_name": "FEEDBACK_COMMENT_THREAD_CREATED",
    "origin": "https://dev.catalog.lear.com",
    "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
    "browser_width": 1713,
    "browser_height": 1262,
    "pathname": "/search",
    "hostname": "dev.catalog.lear.com",
    "is_mobile": false,
    "user_id": "WapDz1sp8e1krznPVONvISzO",
    "owner_slug": "lear-e-catalog",
    "project_id": "prj_fe1TSg8XdYjJlx6QcFcEQLzu4h2L",
    "room_id": "live_mode_1@prj_fe1TSg8XdYjJlx6QcFcEQLzu4h2L@dev",
    "team_id": "team_jOoGF1AqtvPbPWkJso7YCxaD",
    "extension_installed": false,
    "is_external": false,
    "deploymentTarget": "preview",
    "billing_plan": "pro",
    "owner_id": "team_jOoGF1AqtvPbPWkJso7YCxaD"
  }
}
```

### `FEEDBACK_COMMENT_ADDED` — "User commented"

```json
{
  "identity": "17791146925030.3085562194074899",
  "event": "User commented",
  "timestamp": "2026-05-27T11:47:26.611Z",
  "properties": {
    "stable_id": "Rd4L-_-W2LXY0ATz_OylL",
    "event_time": 1779882446611,
    "event_name": "FEEDBACK_COMMENT_ADDED",
    "origin": "https://dev.catalog.lear.com",
    "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
    "browser_width": 1713,
    "browser_height": 1262,
    "pathname": "/search",
    "hostname": "dev.catalog.lear.com",
    "is_mobile": false,
    "user_id": "WapDz1sp8e1krznPVONvISzO",
    "owner_slug": "lear-e-catalog",
    "project_id": "prj_fe1TSg8XdYjJlx6QcFcEQLzu4h2L",
    "room_id": "live_mode_1@prj_fe1TSg8XdYjJlx6QcFcEQLzu4h2L@dev",
    "team_id": "team_jOoGF1AqtvPbPWkJso7YCxaD",
    "extension_installed": false,
    "is_external": false,
    "deploymentTarget": "preview",
    "billing_plan": "pro",
    "owner_id": "team_jOoGF1AqtvPbPWkJso7YCxaD",
    "newThread": true,
    "imageCount": 0
  }
}
```

## Fields worth borrowing for our model

| Vercel field | Our equivalent / takeaway |
|---|---|
| `stable_id` (`Rd4L-_-W2LXY0ATz_OylL`) | Thread id — a URL-safe nanoid. Adopt short, opaque, client-presentable ids. |
| `origin` + `pathname` (+ `hostname`) | Page identity. We key threads by a **normalized page URL** (origin + pathname); query string handling is an open question. |
| `room_id` = `live_mode_1@<project>@<env>` | **Scope** = project × environment. Comments live in a project+env "room"; preview vs prod don't mix. Our secret key resolves to a project/room scope. |
| `deploymentTarget` (`preview`/`production`) | Environment dimension of scope; supports "re-anchor across builds within the same env". |
| `project_id` / `team_id` / `owner_slug` | Multi-tenant scoping keys (post-v1 for us; v1 scope is a single project via the key). |
| `browser_width` / `browser_height` / `is_mobile` / `user_agent` | **Capture context** stored on the thread — viewport at creation aids re-anchoring + repro. |
| `user_id` / `is_external` | Author identity (v1 = self-asserted email → derived id; `is_external` is a roles concept, post-v1). |
| `newThread` | Whether a comment opened a new thread vs replied. |
| `imageCount` | Screenshot attachments per comment. |
| `extension_installed` | Browser-extension capture path — out of scope for us (PRD non-goal). |

---

## `createCommentThread` mutation payloads (the real persistence API)

Provided 2026-05-27 — these are the actual create-thread mutations, far more
informative than the telemetry above. Two cases: a **text selection** and a
**pin**. `frameworkContext` values are truncated here (each was a long
root-to-element React component-tree dump).

### Case A — text-range selection (text "METRIC")

```json
{
  "profileID": "p8bb11621a119452d9fbd427aeebf4a6d",
  "clientID": "0774f874-a10a-4b66-88ab-7774e8c328ff",
  "mutations": [{
    "id": 2,
    "name": "createCommentThread",
    "args": {
      "shortId": 0,
      "id": "EixMoIC44Lel",
      "nodeId": "body>div:nth-of-type(2)>...>button,body>div:nth-of-type(2)>div.flex>...>button.flex",
      "x": 0, "y": 0,
      "page": "/search",
      "pageTitle": "Search | Lear e-Catalog",
      "userAgent": "...Chrome/149...",
      "screenWidth": 1713, "screenHeight": 1262, "devicePixelRatio": 1,
      "selectionRange": {
        "startContainerNodeId": "body>div:nth-of-type(2)>...>button,...>button.flex",
        "startContainerTextNodeIndex": 0,
        "startOffset": 0,
        "endContainerNodeId": "...same dual selector...",
        "endContainerTextNodeIndex": 0,
        "endOffset": 6,
        "text": "METRIC"
      },
      "deploymentUrl": "lear-frontend-lq0nzhuub-lear-e-catalog.vercel.app",
      "draftMode": false,
      "frameworkContext": "React Component Tree (root to selected element): Selected: <button.flex...> …[truncated]",
      "firstComment": {
        "id": "fpWlAEqHzj96T0efZ4xyY",
        "commitSha": "a9a793e8af5e4938d60e20edea70af34f4c7a582",
        "href": "https://dev.catalog.lear.com/search",
        "deployment": {
          "id": "dpl_FaViN8X89SWsq3sXn1Nk4e4sEfBv", "ts": 1779277542376, "author": "mateuszpaulski",
          "gitSource": { "type": "github", "branch": "dev", "sha": "a9a79...", "commitMessage": "Merge pull request #238 …", "repoId": "700306760", "productionBranch": "main" }
        },
        "body": [{ "type": "paragraph", "children": [{ "text": "cz" }] }],
        "text": "cz",
        "images": [],
        "leftOnLocalhost": false
      }
    },
    "timestamp": 44324.5
  }],
  "pushVersion": 0,
  "schemaVersion": ""
}
```

### Case B — pin / point anchor ("test 2")

Same shape, **no `selectionRange`**, and crucially:

```json
{
  "id": "3kXLTXxq-P9l",
  "nodeId": "body>div:nth-of-type(9)>...>div,body>div:nth-of-type(9)>div.flex>...>div.flex",
  "x": 0.3624254681125562,
  "y": 0.39133089133089133,
  "screenWidth": 1229, "screenHeight": 1262, "devicePixelRatio": 1
  // …page/userAgent/deploymentUrl/firstComment same shape as Case A…
}
```

### What these confirm / refine for our model

| Observation | Decision impact |
|---|---|
| **`nodeId` is a *dual* selector** — comma-separated `structural-nth-of-type` **and** `class-annotated` path | Direct evidence for the **composite/redundant fingerprint** (ADR-0004). We store multiple selector variants + the richer signal bag; re-match scores across them. |
| **Pin: `x`,`y` are normalized 0..1** (`0.362`, `0.391`); selection: `x`,`y` = `0`,`0` | Confirms the **element-anchor `(fx, fy)` offset**. Pin uses offset; text uses `selectionRange` instead. |
| **Text: `selectionRange`** = container nodeId + `textNodeIndex` + `start/endOffset` + captured `text` | Refine our text anchor: store this **positional range** *and* keep quote+prefix/suffix for robustness. Positional = fast path; quote = resilient fallback. |
| **Capture context** adds `devicePixelRatio`, `pageTitle`, `screenWidth/Height` | Add these to our stored capture context. |
| **`frameworkContext`** = React component-tree dump | Optional **React-only** extra fingerprint signal; capturable in the React wrapper path. Post-v1 / nice-to-have, not relied on for agnostic core. |
| **`firstComment.deployment` + `gitSource` + `commitSha`** | Provenance: which build/commit a thread was created on. We can't read Vercel's API, but the integrator can pass build/commit via `init()` config — useful for "re-anchor across builds" context. Optional. |
| **`body` is rich-text** (`[{type:paragraph,children:[{text}]}]`) + flat `text` | v1 stores **plain text** (`text`); structured body is the post-v1 seam for markdown/mentions. |
| **`schemaVersion`** field present (empty) | Confirms our **`schemaVersion`** on the anchor/payload. |
| **`id` / firstComment `id`** are nanoids | Confirms short opaque ids for threads and comments. |
