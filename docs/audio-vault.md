# Audio vault import

The terminal player reads `public/tracks.json` and plays files with a plain browser `<audio>` element. It does not use Dropbox, Google Drive, OneDrive, Box, Mega, or SoundCloud embed players.

The audio files are not committed with the app. The local `public/audio-vault/` directory is a generated cache and is ignored by Git and Cloud Run deploys. The live player uses the URLs written into `public/tracks.json`.

## Privacy rule

The importer excludes any path segment named `Personal`, case-insensitive. These files are not copied, converted, or written to `tracks.json`.

Examples that are excluded:

- `Personal/foo.mp3`
- `personal/foo.wav`
- `Howard/Personal/foo.m4a`

## Import from a local folder

Export or sync the Dropbox `/sound & audio` folder locally, then run:

```powershell
npm run import:audio-vault -- "C:\path\to\sound & audio"
```

For production, generate object-storage URLs in the manifest:

```powershell
npm run import:audio-vault -- "C:\path\to\sound & audio" --url-prefix "https://storage.googleapis.com/mario0318-audio-vault-r3-m318/audio-vault/"
```

Dry run:

```powershell
npm run import:audio-vault -- "C:\path\to\sound & audio" --dry-run
```

The importer:

- scans recursively
- skips `Personal`
- accepts `mp3`, `wav`, `m4a`, `mp4`, `wma`, `amr`, `ogg`, `opus`, `flac`, `aac`, `aif`, and `aiff`
- copies MP3 files
- converts every other audio/video container to MP3 with `ffmpeg`
- writes `public/tracks.json`

## Sync the generated audio cache

After importing, upload only the generated audio cache:

```powershell
npm run sync:audio-vault
```

The sync script targets project `r3-m318` and bucket `mario0318-audio-vault-r3-m318` unless overridden with environment variables:

- `AUDIO_VAULT_PROJECT`
- `AUDIO_VAULT_BUCKET`
- `AUDIO_VAULT_LOCATION`

Normal app deploys do not upload `public/audio-vault/`.

## Dropbox connector limitation

The Dropbox connector can list files and create short-lived download links, but those links expire and are not a deployable web catalog. The connector shared-link tool cannot create public anyone-with-link URLs. For a durable public player, use copied/converted static files or upload converted files to a public object store such as Cloudflare R2 or Google Cloud Storage.
