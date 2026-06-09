# Jira Thread Actions Design

- **Status:** Proposed
- **Date:** 2026-06-09
- **Scope:** Manual Jira issue creation from a comments thread, plus the extension capability model needed to support it cleanly.
- **Inputs:** `docs/prd.md`, `docs/architecture.md`, `docs/adr.md`, prior Slack notification design.

## Summary

Jira issue creation is a manual thread action. A reviewer opens a thread, chooses
"Create Jira issue", and the server creates one Jira issue from the full thread
conversation. The resulting Jira issue key and URL are stored on the thread and
shown by the client as a durable external link.

This feature also introduces a broader server extension model. Notifications and
manual integrations are both extensions, but they are separate capabilities:
notifications subscribe to events; thread actions run explicit user commands and
may persist returned state.

## Goals

- Let a reviewer create a Jira task from a thread manually.
- Include the full conversation history in the Jira issue description.
- Store one Jira issue link per thread and prevent duplicate Jira issues.
- Keep Jira credentials server-side.
- Keep Jira dependencies out of the base server/client packages unless the
  integrator opts in.
- Let future integrations, such as Linear or GitHub Issues, reuse the same manual
  thread action shape.
- Let frontend extension UI appear in fixed, typed slots without loading arbitrary
  plugin React code into the embeddable widget.

## Non-goals

- Automatic Jira issue creation for every thread.
- Jira OAuth or per-reviewer Jira identity.
- Bi-directional sync between comments and Jira.
- Custom frontend components supplied by extension packages.
- Multiple Jira issues from the same thread.
- User-selectable Jira project or issue type in the widget.

## Extension Model

The server accepts extensions as a first-class construction option:

```ts
createCommentsServer({
  repository,
  storage,
  secretKey,
  allowedOrigins,
  extensions: [
    slackNotifications({ webhookUrl }),
    jiraIssues({
      siteUrl,
      email,
      apiToken,
      projectKey: 'WEB',
      issueType: 'Task',
      labels: ['comments-feedback'],
    }),
  ],
})
```

`notifiers?` can remain as a compatibility alias during migration, but the
forward-looking public API is `extensions`.

There are two initial extension capabilities:

```ts
type ServerExtension = NotificationExtension | ThreadActionExtension
```

Notifications are automatic event subscribers:

```ts
type NotificationExtension = {
  kind: 'notification'
  name: string
  onEvent(event: NotificationEvent): Promise<void>
}
```

Thread actions are manual commands:

```ts
type ThreadActionExtension = {
  kind: 'thread-action'
  id: string
  provider: string
  label: string
  slot: ExtensionSlot
  visibleWhen?: (ctx: { thread: Thread; scope: Scope }) => boolean
  run(ctx: { thread: Thread; scope: Scope }) => Promise<ThreadActionResult>
}
```

The extension definition may use functions because it runs on the server. The
client never receives executable extension code.

## Client Capability Descriptors

The server evaluates `visibleWhen` against the loaded thread and exposes only the
actions that are currently renderable:

```ts
type ThreadActionDescriptor = {
  id: string
  provider: string
  label: string
  slot: ExtensionSlot
  presentation?: {
    icon?: string
    style?: 'primary' | 'secondary' | 'link'
  }
}
```

The client renders descriptors generically in fixed slots:

- `thread-toolbar` for command buttons such as "Create Jira issue".
- `thread-metadata` for external links such as "Jira WEB-123".
- `panel-row-actions` for future thread-list actions.

One provider may register multiple actions in different slots. Actions are for
operations that do work. Plain navigation is represented by persisted
`externalLinks`, not by a server action.

## Jira Package

Add an optional package:

```txt
@airnauts/comments-integration-jira
```

It exports a factory such as:

```ts
jiraIssues({
  siteUrl: string
  email: string
  apiToken: string
  projectKey: string
  issueType?: string
  labels?: string[]
}): ServerExtension[]
```

For v1, the package registers one action:

```ts
{
  kind: 'thread-action',
  id: 'jira.createIssue',
  provider: 'jira',
  label: 'Create Jira issue',
  slot: 'thread-toolbar',
  visibleWhen: ({ thread }) => !hasExternalLink(thread, 'jira'),
  run: createJiraIssueFromThread,
}
```

The factory returns an array rather than a single extension so the same package
can later register related actions, such as `jira.syncComments`, without changing
the server extension loader.

## Data Model

Threads gain durable external links:

```ts
externalLinks?: Array<{
  provider: 'jira' | string
  externalId: string
  key?: string
  label: string
  url: string
  createdAt: string
  createdBy?: Author
}>
```

For Jira:

```json
{
  "provider": "jira",
  "externalId": "10042",
  "key": "WEB-123",
  "label": "Jira WEB-123",
  "url": "https://company.atlassian.net/browse/WEB-123",
  "createdAt": "2026-06-09T10:00:00.000Z"
}
```

The repository must persist external links on the thread and expose an operation
that appends or upserts a link atomically within scope. For v1, adding a Jira link
when one already exists should not create a second issue.

## API

Add a generic thread-action endpoint:

```http
POST /threads/:id/actions/:actionId
```

For Jira:

```http
POST /threads/:id/actions/jira.createIssue
```

The request uses the existing `x-comments-key` security model. The response
returns the updated full thread, including `externalLinks` and the re-evaluated
action descriptors, so the client can update metadata and available actions from
one response.

The server flow:

1. Authenticate and resolve scope.
2. Load the full thread.
3. Find the registered thread action by `actionId`.
4. Evaluate `visibleWhen`; reject hidden actions.
5. Run the action.
6. Persist the returned external link.
7. Return the updated thread.

If the action is unknown, return 404. If it is registered but not visible for the
thread, return 409.

## Jira Issue Content

The Jira issue summary is generated from the first comment:

```txt
[Page feedback] <first comment excerpt>
```

The description includes:

- Page title and URL.
- Thread ID.
- Thread status and anchor state.
- Full comment history with author, timestamp, text, and edit timestamp when present.
- Attachment links.
- Provenance when present: branch, commit SHA, deployment ID.
- Capture context when useful for reproduction.

The Jira package owns Jira Cloud payload formatting. Use Atlassian Document Format
for Jira Cloud REST v3 rather than ad hoc markdown strings.

## Frontend Behavior

The client reads action descriptors from thread responses and renders them in
known slots.

Before Jira is linked:

- `thread-toolbar` shows "Create Jira issue".
- Clicking it calls `POST /threads/:id/actions/jira.createIssue`.
- The button shows loading state while the request is in flight.
- On success, the thread state updates with the returned external link.

After Jira is linked:

- The create action is no longer visible.
- `thread-metadata` shows the persisted Jira link, for example "Jira WEB-123".

The client does not import Jira-specific React components or execute extension
code. It renders generic buttons, links, loading states, and error toasts from
typed descriptors and external links.

## Error Handling

Manual action failures are visible to the reviewer.

- Invalid Jira configuration should fail server startup when possible.
- Jira auth failures return a typed integration error.
- Jira network failures return a typed integration error and do not persist an
  external link.
- A duplicate Jira create attempt returns the existing link or a conflict, but
  never creates another issue.
- If Jira issue creation succeeds but repository persistence fails, the server
  returns an error and logs the Jira issue key/URL so the link can be recovered.
  This is the hardest edge case; the v1 mitigation is explicit logging and no
  silent success.

Notification extension failures remain isolated and do not affect writes. Thread
action failures are not isolated because the user explicitly asked for the action.

## Testing

Backend remains test-first.

- Core schema tests for `ExternalLink`, `ThreadActionDescriptor`, and the action
  route schemas.
- Server use-case tests for action routing, unknown action, hidden action,
  duplicate Jira link, and successful link persistence.
- Repository contract tests for external link persistence.
- Mongo and memory adapter coverage for external links.
- Jira package tests with mocked `fetch` for auth headers, Jira Cloud payload
  shape, summary truncation, ADF description formatting, and Jira error mapping.
- Client tests for slot rendering, action loading/error states, and linked-state
  rendering.

## Architecture Decision Record

This feature should add an ADR because it introduces a public extension capability
model and changes the server construction API. The ADR should capture why
notifications and thread actions share plugin packaging but keep separate behavior
contracts.

## Response Shape Decisions

- `externalLinks` are included on both full threads and thread list items. The
  full thread view needs them for metadata; the list view can use them for future
  panel badges without refetching each thread.
- Action descriptors are embedded in thread responses and thread list items as an
  evaluated `actions` array. A separate capabilities endpoint is unnecessary for
  v1 because action visibility is thread-dependent.
- `POST /threads/:id/actions/:actionId` returns the updated full thread after the
  action completes and persistence succeeds.
