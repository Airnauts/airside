# Reference — Vercel live-feedback widget DOM structure

> Captured from a live Vercel Comments session 2026-05-27. The raw HTML was very
> large and full of minified class names; this is a **distilled, annotated
> skeleton** of the meaningful structure. The single most important takeaway is
> at the top.

## ⚠️ Headline: Vercel uses **light DOM, not Shadow DOM**

The root frame is:

```html
<div id="vercel-live-feedback-full-frame"
     class="tailwind tailwind-no-preflight"
     style="all: revert;">
```

Isolation strategy = **scoped Tailwind with preflight disabled** + **`all: revert`**
on the root (neutralizes inherited host styles) — *instead of* a Shadow root.
This is the opposite of the Shadow-DOM approach in our ADR-0002/0005 and is worth
a deliberate decision (see the isolation-strategy ADR).

## Annotated skeleton

```
#vercel-live-feedback-full-frame .tailwind.tailwind-no-preflight  style="all:revert"   ← light DOM, scoped TW, no preflight
  .dark-theme                                                     ← theming via class + CSS vars (Geist: --ds-*, --accents-*, --geist-foreground)
    div[style="display:contents; pointer-events:auto"]
      #feedback-toolbar  style="--tool-count:2; left:829px; top:631px"                  ← floating, abs-positioned toolbar
        button[aria-label=Comment]        (+ kbd "C")
        button[aria-label="Vercel Toolbar"] (+ kbd "⌃")
    <style> .geist-overlay{z-index:100000000001} .geist-overlay-backdrop{z-index:10000000000} </style>   ← enormous z-indexes
    div[data-portal-container]  style="z-index:2147400104; position:relative"           ← explicit portal container (menus/popovers)
    div[data-toasts-container]  style="z-index:2147400104"                              ← toasts container
    div.thread-overlay × N      style="position:fixed; inset:0 auto auto 0; z-index:calc(var(--z-comment-thread)+0); pointer-events:none"   ← one per thread, none until active
    div.thread-overlay.active   style="position:fixed; top:84.98px; left:68.17px; pointer-events:auto"     ← active thread popover
      div[data-thread-id="3kXLTXxq-P9l"]                                                ← matches the pin mutation payload id
        div[data-preview-comment="7J9YiEp2cXTr8yqpVf_ZO"]
          avatar(img …/avatar?u=mateuszpaulski) · author "mateuszpaulski" · time "10m"
          actions: react · copy-link · resolve(✓, with <canvas> confetti) · kebab-menu
          body: Slate editor  (data-slate-editor / data-slate-string="test 2")          ← rich-text via Slate
      reply composer:
        <iframe srcdoc title="editor">                                                  ← composer isolated inside an iframe
        button[title="Select images"]  →  input[type=file accept=image/* multiple]      ← upload (our v1 path)
        button[title="Take a screenshot"]                                               ← capture (PRD §9 open Q, NOT v1)
        button (emoji/mention)
        button[title="Send comment"]  disabled-when-empty
    .position-context                                                                   ← pin layer
      div[style="position:absolute; left:508.18px; top:84.99px"]                        ← pin placed at computed element coords
        <svg> teardrop/comment-marker (rounded, one flat corner) + avatar(pink border #ff0080) + count "1"
        .hoverglow radial-gradient hover effect
```

## Takeaways for our build

| Observation | Implication |
|---|---|
| **Light DOM + `all:revert` + Tailwind no-preflight** (no Shadow DOM) | Decision point vs our ADR-0002/0005 — see isolation-strategy comparison. Light DOM is the native habitat for shadcn/Radix portals. |
| `data-portal-container` / `data-toasts-container`, z-index ~2.1B | Whatever isolation we pick, we need a single high-z portal container + a toast container. |
| Per-thread **fixed overlay**, `pointer-events:none` until active | Confirms our overlay-layer design (§2). |
| Pins in a separate `.position-context`, abs-positioned at element coords | Confirms pin layer; pin = SVG marker + avatar + unresolved count. |
| Composer = **Slate**, inside an **`<iframe srcdoc>`** | Vercel isolates the contenteditable in an iframe. v1 we only need plain text → a textarea is enough; Slate/iframe is post-v1 rich-text territory. |
| Upload **and** screenshot-capture buttons present | v1 = upload only (PRD §9); capture deferred. |
| `data-thread-id` / `data-preview-comment` ids match the mutation payloads | Same id scheme end-to-end. |
| Resolve uses a `<canvas>` | Confetti/animation flourish on resolve (nice-to-have). |
