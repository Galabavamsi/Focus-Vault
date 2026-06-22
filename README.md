# FocusVault

FocusVault is a local-first desktop study vault for collecting links, videos, articles, papers, PDFs, slides, course material, tasks, goals, daily logs, and AI-assisted planning.

It is built for one personal workflow: capture everything quickly, organize it later, track progress, and ask the helper bot what needs attention next.

## Features

- Link dump for YouTube videos, playlists, articles, papers, and quick notes.
- Coursework tiles for PDFs, slides, images, and files.
- Progress tracking with resume points, revision status, checklists, and notes.
- Daily logger with contribution-style activity tracking.
- Timeline and archive views for completed work.
- Local desktop app with a dark glass UI.
- Optional AI assistant using DeepSeek/OpenAI-compatible API keys stored locally in the desktop app.

## Download

The easiest install path is the GitHub Releases page:

1. Open the releases page for this repository.
2. Download `FocusVault Setup .exe` for a normal Windows install, or the portable `.exe` if you do not want an installer.
3. Run the file and launch FocusVault.

Releases are built from tags such as `v0.1.0`. If no release is published yet, use the source install steps below.

## Install From Source

Requirements:

- Node.js 22 LTS recommended for packaging.
- npm.
- Windows 10/11 for the packaged desktop build.

```powershell
git clone https://github.com/Galabavamsi/Focus-Vault.git
cd Focus-Vault
npm install
npm run desktop
```

For development with hot reload:

```powershell
npm install
npm run dev
```

In another terminal:

```powershell
npm run desktop:dev
```

## Build A Downloadable Windows App

To create installer and portable builds locally:

```powershell
npm install
npm run package:win
```

The generated files will appear in:

```text
release/
```

Upload the installer and portable `.exe` files from `release/` to a GitHub Release so people can download the app without touching code.

## Publish A GitHub Release

1. Update the version in `package.json`.
2. Commit the change.
3. Create and push a tag:

```powershell
git tag v0.1.0
git push origin main --tags
```

4. On GitHub, create a release from that tag.
5. The release workflow can build the Windows installer and attach artifacts.

## AI Provider Notes

The assistant works locally without an API key for simple app-aware answers. For cloud AI:

1. Open the Assistant tab.
2. Click Provider.
3. Add a DeepSeek, OpenAI-compatible, or custom OpenAI-compatible endpoint.
4. Save the key.

API keys are saved by the Electron desktop app using local OS-backed storage when available. Do not commit `.env` files or personal keys.

## Project Scripts

```text
npm run dev          Start Vite dev server
npm run build        Type-check and build the web app
npm run preview      Preview the built web app
npm run desktop      Build and open the desktop app
npm run desktop:dev  Open Electron against the dev server
npm run package:win  Build Windows installer and portable app
npm run package:dir  Build unpacked app directory
```

## Data And Privacy

FocusVault is designed for local personal use. Saved vault data lives in the browser/Electron local storage on your machine. AI provider settings are stored locally by the desktop app.

## Contributing

Issues and pull requests are welcome. Please keep changes focused, run `npm run build`, and avoid committing generated folders such as `node_modules/`, `dist/`, and `release/`.

## License

MIT License. See [LICENSE](LICENSE).
