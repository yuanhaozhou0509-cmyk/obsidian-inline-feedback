# Contributing

Thanks for considering a contribution to Inline Feedback.

## Development Setup

1. Install dependencies:

```bash
npm install
```

2. Build the plugin:

```bash
npm run build
```

3. Copy or symlink `main.js`, `manifest.json`, and `styles.css` into a test vault:

```text
<vault>/.obsidian/plugins/inline-feedback/
```

4. Enable community plugins in Obsidian and turn on Inline Feedback.

## Pull Request Guidelines

- Keep user-facing text in English for now.
- Do not commit vault-local data such as `.feedback.json`, `feedback_log.md`, or `knowledge_cards/`.
- Keep the feedback JSON schema backward compatible unless the release notes explain a migration path.
- Run `npm run build` before opening a pull request.

## Issue Reports

When reporting a bug, include:

- Obsidian version
- Operating system
- Plugin version
- Steps to reproduce
- Expected result
- Actual result

