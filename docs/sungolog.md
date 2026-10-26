# sungolog v.3.1

The publication lives at `/sungolog/`, with its owner desk at `/sungolog/desk.html`. The terminal commands `sungolog`, `blog` and `journal` open it. There is also a direct link in the terminal header.

This checkout contains the implementation. Deployment, live sign-in and social account connections have not been verified. Access diagnostics identified an explicitly network-disabled command session. The Google SDK crash was separately traced to braces in its sandbox temporary-directory path; scripts/repair-gcloud-session.ps1 now prepares a writable path without braces and successfully lists the configured account. Google token refresh still fails on DNS, so live cloud authorization has not been tested. Fresh Chrome tabs restored browser control. Claude completed an architecture review at https://claude.ai/chat/64e1e990-3204-41bd-8d55-1c101cee066f. Its concerns about memory limits, write frequency and soft-delete storage need a code-specific follow-up before deployment; some other warnings describe protections already present. The browser Cloud Console requires Google sign-in. Production remains unchanged.

## What is implemented

Original text and image posts can be saved privately or published. They can be revised, with previous versions preserved. Social archive wording cannot be edited through the desk or API. Source API changes append captured versions rather than replacing old content. A recovered media download gets a separate recovery label.

Google sign-in is restricted server-side to the verified `mario0318@gmail.com` account. Private posts and private media require its Firebase token. The storage bucket is private, including objects belonging to published entries; the application checks access before serving a copy. Publishing an archived entry makes its preserved versions readable too. The desk explicitly confirms this action.

Bluesky public accounts can be connected by handle. Checks fetch the latest page, advance historical backfill, and recheck a rotating set of older captured posts. A three-minute sync budget and per-post checkpoints preserve progress when media is slow. Imports start private. This is bounded polling, not an assertion that all social platforms offer edit webhooks. An absent API record is marked unavailable, never assumed deleted. Versions edited and removed between checks cannot be recovered. Reposts by other authors are not silently treated as the owner's posts.

Images are copied and hashed, not embedded from expiring social links. Failed downloads are marked, with retry on later checks. Streaming video, external-page previews and quoted posts have explicit incomplete-copy markers. No claim of complete media capture is made for those items. Four files per post, 10 MiB each with a combined 20 MiB upload limit, and a 1 GiB archive safety limit keep imports bounded. The JSON state has an 8 MiB limit; this is for a personal collection, not an unbounded publishing service.

Automatic imports for Instagram, Facebook, X, Threads and private social accounts are not implemented. Those need the exact account links plus the platform's available authorization, permissions and API terms. There is no paid social API subscription in this implementation. Private content can be imported as a structured record once obtained through an authorized export. It never becomes public merely because it was imported.

## Storage and deployment

The proposed arrangement reuses Cloud Run service `mario0318-site` in `r3-m318/us-central1` and the existing Firebase project `mario0318-terminal-live` for sign-in. It adds one private regional Standard bucket, `mario0318-sungolog-r3-m318`, with uniform access and enforced public access prevention. Seven-day soft delete protects accidental storage deletion. No bucket retention lock, paid database, paid connector or additional cloud provider is needed. Project policy enforcement and bucket name availability remain unverified until cloud access works.

`scripts/deploy-sungolog.ps1` prints the concrete plan without making changes by default. `-Apply` runs the tests, configures storage and the source-check job, and deploys the existing service. It retains existing service environment variables. It reuses the existing runtime identity, and gives that identity access only to the new archive bucket. A separate scheduler identity is accepted by the application's verified OIDC endpoint, rather than putting a shared sync secret in the browser.

The script adds `mario0318.com` to the existing Firebase authorized domains only if missing. Live owner sign-in still needs verification after deployment. A newly created service account may need a short propagation delay before Scheduler accepts it; rerunning the script after that delay reuses resources.

Production refuses to use container-local storage. Development uses `output/sungolog-data/`, which is ignored by both Git and cloud deploys. Never publish that directory, test data, or an owner export. No private key files are required in the application.

Environment variables are `SUNGOLOG_BUCKET`, the public browser configuration `SUNGOLOG_FIREBASE_API_KEY`, `SUNGOLOG_SYNC_EMAIL`, and `SUNGOLOG_SYNC_AUDIENCE`. An alternative server-only `SUNGOLOG_SYNC_TOKEN` must be at least 32 characters. It is optional and is not used by the deployment script.

## Cost boundary

The target is $0 additional recurring cost for a small collection with free quota remaining. Current account usage could not be inspected, so $0 is a target, not a confirmed bill or a hard spending cap.

Google Cloud Storage lists 5 GB-months regional Standard storage, 5,000 Class A operations and 50,000 Class B operations monthly in eligible US regions. The allowance is shared with existing eligible usage. A 1 GiB application guard does not reserve that allowance. Soft-deleted objects, build artifacts and orphaned objects from interrupted transactions can consume additional storage outside the application's count.

The proposed Scheduler job runs four times daily. The first three jobs per billing account are free, otherwise this job is $0.10 per month. Request frequency does not create an extra job charge. The actual job is not created until deployment.

Cloud Run's outbound transfer allowance is distinct from Cloud Storage's allowance. Media served through the application consumes Cloud Run outbound transfer. Heavy public media traffic can exceed the $1 or $2 tolerance, so check remaining account usage and traffic before making a large media collection public. No storage guard is a billing cap. Keeping source captures private until selected for publication limits accidental exposure; it does not establish a cost ceiling.

Sources checked October 22, 2026:

* https://cloud.google.com/storage/pricing
* https://cloud.google.com/scheduler/pricing
* https://docs.cloud.google.com/free/docs/free-cloud-features

## Structured owner import

The import UI accepts one post in this shape, not a raw Meta export or a sungolog export:

```json
{
  "platform": "platform name",
  "sourceURL": "https://platform.example/post/id",
  "sourceId": "stable original post id",
  "publishedAt": "2026-10-22T12:00:00Z",
  "text": "exact saved wording",
  "media": [
    { "data": "BASE64_FILE_BYTES", "type": "image/jpeg", "alt": "original image description" }
  ]
}
```

Unknown posting dates should be omitted, rather than invented. The captured timestamp is recorded separately. Owner imports have `owner-import` provenance, never `platform-api`. The original source URL is stored as supplied; imports do not prove that the platform independently authenticated the wording.

The records JSON download includes revision histories, raw source records and media references. It excludes media binaries and is not a complete portable backup. The bucket contains actual media copies and immutable snapshot objects. Restoring an exported collection through the desk is not implemented.

## Validation

`npm test` covers terminal regression checks. `npm run test:sungolog` covers private access, immutable revisions, persistence, source deduplication, media retry, storage concurrency and token validation. The browser tests use intercepted requests so they do not require a live cloud account. They are in `tests/sungolog.browser.spec.mjs` and run with `npm run test:sungolog:browser`.

In this session the terminal suite passed 168 checks and the archive suite passed 14 tests. The browser process failed to launch in the sandbox, so responsive rendering, screenshots and the interactive browser flows remain unverified. No fabricated posts were added to the publication.
