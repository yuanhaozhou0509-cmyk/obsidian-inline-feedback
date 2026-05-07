# Inline Feedback

Inline Feedback is an Obsidian plugin for lightweight text-level review. Select text, attach feedback, review annotations in a sidebar, and export structured notes that an AI assistant or writing agent can use for revision.

[中文说明](README.zh-CN.md)

![Inline feedback demo](docs/assets/inline-feedback-demo.svg)

## What It Does

- Select text in a Markdown note and add inline feedback without rewriting the note.
- Keep feedback next to the source note in `<note>.feedback.json`.
- Review, edit, delete, and navigate annotations from a sidebar.
- Export a readable Markdown summary to `<note>.feedback_export.md`.
- Append review items to `feedback_log.md` for project-level tracking.
- Save high-value excerpts as Knowledge Cards for reuse in later writing.

Inline Feedback is useful for AI-assisted writing, shared vault review, editorial passes, research notes, and workflows where one machine or account marks up text and another AI or agent performs the revision.

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

| Add feedback | Export for AI revision |
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
https://github.com/zyh14/obsidian-inline-feedback
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
6. Export feedback when you want an AI assistant to revise the note.

Example instruction for an AI assistant:

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

A readable Markdown summary designed for review and AI revision prompts.

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

