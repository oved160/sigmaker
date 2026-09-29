# SigMaker

Free, privacy-first HTML email signature generator. Static front end (`index.html`, `styles.css`, `app.js`) plus serverless functions for contact icons (`api/icon.js`) and optional photo hosting (`api/upload.js`, Vercel Blob).

## Photos: embedded by default

The photo never leaves the browser unless the user opts in. SigMaker crops, shapes and resizes it to 240×240 and embeds it in the signature as a `data:` URI. Tested in Gmail: pasting the signature turns the photo into an inline attachment (`cid:`) of every email sent, so it displays for recipients and never depends on a server. A downscaled original (`photoOrig`, max 480px) stays in the page state so shape/fit can be changed later.

Linked images (`https://…`) are kept as links by Gmail, so they only keep working while the link does. Pasted Google Drive and Dropbox share links are converted to direct image links.

**Optional hosting** ("Also host my photo online"): for mail apps that drop embedded images, the processed photo is POSTed to `/api/upload`, stored in Vercel Blob under a random UUID, and the signature links to it. The endpoint accepts only PNG/JPEG up to 512 KB, verifies the file's magic bytes, and rejects requests from other origins. Circle and rounded photo shapes are cut into the image itself (transparent PNG), because Outlook for Windows ignores `border-radius`.

Uploads are rate limited (`api/_ratelimit.js`): 20/hour and 60/day per visitor, 2,000/day overall. Visitor IPs are only kept as a salted hash for the length of the window. By default the counters live in each function instance's memory; for limits shared across instances, add **Upstash for Redis** from the Vercel Marketplace (free tier) — its env vars are picked up automatically. Optionally set `RATE_LIMIT_SALT` to a random string.

Fonts (Inter, Fraunces — SIL OFL) are self-hosted in `fonts/`, so the page makes no third-party requests.

## Feedback

The **Feedback** button (header and footer) posts to `api/feedback.js`, which saves each message as a JSON file under `feedback/` in the Blob store (random filename, no IP or other identifiers). Read them at **`/feedback-inbox`** — a private page (not linked, `noindex`) protected by the `FEEDBACK_KEY` environment variable, with delete — or in Vercel → **Storage → Blob → feedback/**. Limits: 5/hour per visitor, 300/day overall, plus a hidden honeypot field for bots.

## Contact icons

Icon artwork lives in `icons.js` (Tabler Icons, MIT) and is shared by the page and `api/icon.js`. The preview draws the SVG directly; exported signatures point at `/i/<set>/<hex>/<name>.png`, which `api/icon.js` renders to PNG with resvg (email clients don't support SVG) and the CDN caches forever. Signatures therefore depend on the production domain staying public and stable.

## Deploy to Vercel

1. Push this folder to a GitHub repo, then **Add New → Project** on vercel.com and import it (framework preset: **Other**, no build command).
   Or from this folder: `npx vercel` and follow the prompts.
2. In the project, open **Storage → Create → Blob**, choose **Public** access and the **Frankfurt (fra1)** region (matching the function region in `vercel.json`), and connect it to the project. This adds `BLOB_STORE_ID` (OIDC) or, on older connections, `BLOB_READ_WRITE_TOKEN` — either works.
3. Redeploy so the function picks up the token.
4. **Settings → Deployment Protection:** turn off Vercel Authentication for production. Otherwise the site and the icon images in sent signatures require a Vercel login.

Without step 2 the site still works; photos are embedded (the default anyway), and opting into hosting falls back to embedding.

## Right-to-left

Every user-entered text run is wrapped in its own `dir="auto"` span (phone, email and URLs in `dir="ltr"`), so mixed Hebrew/Arabic and English reads correctly in any layout. Gmail's signature editor strips `dir`/`direction` from block elements and lays tables out in its own editor direction, so templates use symmetric spacer columns instead of one-sided padding and never force `text-align` — the layout looks right whichever way the columns run.

## Local development

```bash
npm install
npx vercel dev
```

Opening `index.html` directly works too, minus image hosting.
