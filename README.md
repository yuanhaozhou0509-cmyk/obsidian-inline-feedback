# Inline Feedback

Inline Feedback is an Obsidian plugin for lightweight text-level review. Select text, attach precise feedback, and let Codex, Claude Code, OpenClaw, Hermes Agent, or another AI agent read the saved feedback files directly from your Obsidian vault.

[中文说明](README.zh-CN.md)

![Inline feedback demo](docs/assets/inline-feedback-demo.svg)

## What It Does

- Select text in a Markdown note and add inline feedback without rewriting the note.
- Keep feedback next to the source note in `<note>.feedback.json`.
- Review, edit, delete, and navigate annotations from a sidebar.
- Let coding and writing agents read `<note>.feedback.json` directly from the vault.
- Optionally export a readable Markdown summary to `<note>.feedback_export.md`.
- Append review items to `feedback_log.md` for project-level tracking.
- Save high-value excerpts as Knowledge Cards for reuse in later writing.

Inline Feedback is useful for AI-assisted writing, shared vault review, editorial passes, research notes, and workflows where one machine or account marks up text and another AI or agent performs the revision.

It is especially useful when you work with agent tools such as Codex, Claude Code, OpenClaw, Hermes Agent, or similar local/remote AI workstations. Instead of describing feedback loosely in chat, you mark the exact sentence or paragraph in Obsidian. The agent can then inspect the companion `.feedback.json` file and understand exactly what text you meant and what change you want.

## Why It Exists

Markdown is excellent for writing, but it does not have a simple Google Docs-style comment layer that stays local, syncs with an Obsidian vault, and is easy for AI tools to consume. Inline Feedback fills that gap with plain local files:

```text
my-note.md
my-note.feedback.json
my-note.feedback_export.md
feedback_log.md
knowledge_cards/_library.json
knowledge_cards/_library.md
```

No server is involved. The plugin only writes files inside your vault.

## Screenshots

| Add precise feedback | Optional AI-readable summary |
| --- | --- |
| ![Add feedback](docs/assets/inline-feedback-demo.svg) | ![Export summary](docs/assets/export-demo.svg) |

| Knowledge Cards |
| --- |
| ![Knowledge cards](docs/assets/knowledge-cards-demo.svg) |

The screenshots use the safe sample note in [`docs/demo-note.md`](docs/demo-note.md).

## Installation

### BRAT

1. Install the Obsidian BRAT plugin.
2. In BRAT, choose `Add beta plugin`.
3. Enter:

```text
https://github.com/yuanhaozhou0509-cmyk/obsidian-inline-feedback
```

4. Enable `Inline Feedback` in Obsidian community plugins.

### Manual Install

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest GitHub Release.
2. Create this folder in your vault:

```text
<vault>/.obsidian/plugins/inline-feedback/
```

3. Put the three files in that folder.
4. Reload Obsidian and enable `Inline Feedback`.

### Build From Source

```bash
npm install
npm run build
```

Then copy `main.js`, `manifest.json`, and `styles.css` into your test vault plugin folder.

## Basic Workflow

1. Open a Markdown note.
2. Select a sentence or paragraph.
3. Click `Add feedback` in the floating popup, or use the editor context menu.
4. Write feedback and press `Ctrl+Enter`.
5. Open the feedback panel from the ribbon icon or command palette.
6. Ask your AI agent to read the `.feedback.json` next to the note and revise accordingly.
7. Optionally export a Markdown summary if you prefer to paste a human-readable feedback file into chat.

Example instruction for an AI assistant or coding agent:

```text
Please revise my-note.md according to my-note.feedback.json.
Preserve the original structure where possible.
For each annotation, use originalText as the target span and feedback as the requested change.
```

## Data Files

### `<note>.feedback.json`

```json
{
  "source": "my-note.md",
  "annotations": [
    {
      "id": "lxy123abc",
      "originalText": "The selected text",
      "feedback": "Make this claim more concrete.",
      "lineStart": 12,
      "lineEnd": 12,
      "charStart": 4,
      "charEnd": 21,
      "timestamp": "2026-05-07T12:00:00.000Z"
    }
  ]
}
```

### `<note>.feedback_export.md`

A readable Markdown summary for users who prefer to paste feedback into chat. This is optional; agents that can access your vault can use `<note>.feedback.json` directly.

### `feedback_log.md`

A lightweight table that collects feedback summaries across notes.

### `knowledge_cards/`

Knowledge Cards store reusable excerpts, keywords, categories, source note paths, source line numbers, and optional notes. The plugin generates both `_library.json` and `_library.md`.

## Privacy

Inline Feedback does not upload content. It has no backend and no telemetry. All annotations, exports, logs, images, and Knowledge Cards are stored in your local Obsidian vault and sync only through whatever sync tool you already use.

## Release Notes

This is a desktop-first `1.0.0` release. Mobile support is not claimed yet because the current UI has only been designed and tested for desktop Obsidian.

GitHub Releases should attach:

- `main.js`
- `manifest.json`
- `styles.css`

The release tag must match the `version` in `manifest.json`.

## License

MIT. See [LICENSE](LICENSE).


