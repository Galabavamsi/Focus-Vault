# Contributing

Thanks for helping improve FocusVault.

## Local Setup

```powershell
npm install
npm run dev
```

For the desktop shell during development:

```powershell
npm run desktop:dev
```

## Before Opening A Pull Request

Run:

```powershell
npm run build
npm audit --audit-level=moderate
```

Keep pull requests focused. UI changes should include a short note about the screens and viewports tested.

## Project Style

- Keep the app local-first and personal-use friendly.
- Prefer simple, readable React state over heavy abstractions.
- Do not commit generated output: `node_modules/`, `dist/`, `release/`, screenshots, logs, or local secrets.
- Never commit API keys.
