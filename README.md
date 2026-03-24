# Lingoa

A desktop app for managing GitHub repository i18n translations.

Lingoa gives translators a streamlined workflow to browse, edit, and submit translations via GitHub pull requests — without needing to know git or the GitHub API.

## Features

- **Repository discovery** — open any local clone and auto-detect all i18n files (JSON/YAML)
- **Side-by-side editor** — source text at the top, editable translation at the bottom
- **Key status indicators** — see at a glance which keys are missing, in review, or done
- **PR proposals** — view competing translations from open PRs by other contributors
- **One-click PR submission** — branches, commits, pushes, and creates the PR automatically
- **PR review** — approve or request changes on other contributors' translation PRs

## Prerequisites

- [Node.js](https://nodejs.org/)
- [Rust toolchain](https://rustup.rs/)
- Git (must be available on `PATH`)
- A GitHub personal access token with `repo` scope

## Getting started

```bash
# Install dependencies
npm install

# Run in development mode (hot reload)
npm run tauri dev
```

On first launch, Lingoa will ask for your GitHub token. It is stored securely in your OS keychain and never written to disk.

## Building

```bash
# Type-check and bundle frontend
npm run build

# Build the distributable app (creates installer in src-tauri/target/release/bundle/)
npm run tauri build
```

## Usage

1. **Open a repo** — click "Open folder" and select a local clone of a GitHub repository.
2. **Select files** — Lingoa scans for i18n files and groups them by locale. Pick a source locale and a target locale.
3. **Translate** — edit translations in the right-hand panel. Use `Ctrl+Enter` to save and move to the next key, or `Shift+↓/↑` to navigate.
4. **Submit** — click "Create PR" to push your changes and open a pull request on GitHub.
5. **Review** — switch to the Review tab to see open translation PRs from others and approve or request changes.

## Supported file formats

- **JSON** — flat, nested, or `{ text, context }` structured values
- **YAML** — same structure, serialized with 2-space indent

Locale detection works on filenames (`en.json`, `messages.fr.yaml`) and directory names (`locales/en/strings.json`).

## License

MIT
