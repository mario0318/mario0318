# mario0318-app Notes

This repo is the standalone source for `mario0318.com`.

Current runtime:

- `server.js` serves files from `public/`
- `/` resolves to `public/index.html`
- favicon is `public/favicon.svg`
- web manifest is `public/manifest.json`
- social image is `public/og-image.svg`
- deploy target is Cloud Run service `mario0318-site` in `us-central1`

Current page shape:

- interactive orbit-based landing page on a full-screen canvas
- three primary world clusters: `mario0318`, `raul3`, and `reach`
- direct routes for video, audio, social, code, sprime, raul3, dapp.cam, fairchild, email, amazon, and linktree
- timestamp marker anchored at the bottom of the screen

Audit checklist:

- root route serves `public/index.html`
- canvas interaction works at desktop and mobile sizes
- direct links resolve to the expected public endpoints
- only one external font-independent runtime dependency: the browser itself

Deploy:

```powershell
.\deploy-mario0318.ps1
```
