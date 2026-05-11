# Decision Cockpit MVP

Local-first React + TypeScript MVP for structuring a decision, comparing options, and generating a transparent recommendation with browser persistence.

## Project alignment

- GitHub repo: `https://github.com/SirojNesuah/decision-cockpit`
- Paperclip workspace: this checked-out local workspace is the only execution root for code and local bridge writes
- local artifact path: exported bridge files live inside `<workspace>/.decision-cockpit/`

## Three-level rule

Keep these three levels aligned and do not bypass them:

1. GitHub repo level
   `origin/main` is the canonical shared history for the project.
2. Paperclip workspace level
   local execution, edits, validation, and the Vite bridge all run only inside the checked-out workspace.
3. Visible local path level
   user-facing inspect/open actions must resolve to files written under `<workspace>/.decision-cockpit/` when the bridge is available.

If the bridge is unavailable, the app may fall back to copied shell commands, but the preferred direct path remains workspace-local and repo-aligned.

## What it does

- captures a decision title, context, prompt, assumptions, risks, and trade-offs
- supports multiple options with explicit metrics and reasoning fields
- ranks options using a lightweight transparent heuristic
- persists the current decision locally in the browser
- exposes a Mac-friendly local handoff path for exported JSON files

## Mac local inspect/open path

When the app is running through `npm run dev`, it now exposes a local workspace bridge through the Vite dev server. In that mode the `Local Mac handoff` card can:

- save the current decision JSON directly into `<workspace>/.decision-cockpit/`
- trigger Quick Look inspection on macOS
- reveal the saved file in Finder on macOS

If the local bridge is unavailable, the same card falls back to command-copy helpers. After clicking `Download JSON`, use that fallback to:

- set the expected local export directory, such as `~/Downloads`
- copy the exact exported file path
- copy a Quick Look inspect command: `qlmanage -p '...'`
- copy a Finder reveal command: `open -R '...'`

This keeps the flow local-first without pretending the browser can directly open arbitrary files on macOS.

## Run locally

```bash
npm install --include=dev
npm run dev
```

The dev server will print a local URL, typically `http://localhost:5173`.

## Validate

```bash
npm run lint
npm run build
```
