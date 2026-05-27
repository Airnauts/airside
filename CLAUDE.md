# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

This is a **greenfield / pre-implementation** repository. As of this writing it contains no application code, build tooling, or tests — only `docs/project.md`, which holds the product concept and research notes. There are no build, lint, or test commands yet; establish them when the stack is chosen and document them here.

The additional working directory `../gametextures` is a **separate, unrelated** WordPress project. Do not conflate the two — changes for this project belong only under `commeting-tool/`.

## What we're building

A standalone commenting tool modeled on [Vercel's preview-deployment Comments](https://vercel.com/docs/comments) — "Figma-like" feedback anchored directly to a live web page, but as an independent product rather than tied to Vercel deployments. See `docs/project.md` for the source research.

The defining architectural idea: comments **anchor to DOM elements, not pixel coordinates**, so they survive layout shifts and responsive reflow. How elements are referenced (id / CSS selector / XPath / structural fingerprint) is the central open design question and is not yet decided.

## Core feature set (target scope)

- On-page commenting with DOM-element positioning and thread-based conversations
- `@`-mentions with notifications
- Emoji reactions and `:emoji:` autocomplete
- Markdown formatting in comments (bold, italic, strikethrough, code, quotes, lists)
- Screenshot attachments: file upload, full-page capture, drag-to-capture region
- Thread resolution tracking
- Email notifications for comment activity
- Authentication required to comment
- Permission-based access (team members, invited external users, public-with-link)
- Optional Slack thread linking

## Working notes

- `docs/project.md` is a captured chat transcript, not a polished spec — treat it as background, and confirm requirements with the user before treating any item as fixed.
- No tech stack has been chosen. Confirm framework, language, and data-store decisions with the user before scaffolding; do not assume.
