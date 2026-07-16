# mario0318.com

Standalone source for the public mario0318 terminal.

## Runtime

- `server.js` serves static files from `public/`.
- `/` resolves to `public/index.html`.
- The terminal uses native ES modules with no framework or build step.
- Public commands are declared in `public/commands.public.json`.
- Applets are lazy-loaded from `public/applets/`.

## Local preview

```powershell
npm start
```

Open `http://localhost:8080`.

## Tests

```powershell
npm test
```

## Deployment

The Cloud Run target is `mario0318-site` in project `r3-m318`, region `us-central1`.

```powershell
.\deploy-mario0318.ps1
```

Deployment is intentionally manual.
