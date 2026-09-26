# SigMaker

Free, privacy-first HTML email signature generator. Static front end (`index.html`, `styles.css`, `app.js`) plus one serverless function (`api/upload.js`) that hosts signature images on Vercel Blob.

## Why images need hosting

Gmail and most webmail clients strip images embedded in a signature (`data:` URIs). The image has to live at a public `https://` URL. SigMaker:

1. Crops and resizes the upload to 240×240 in the browser (typically 5–30 KB).
2. POSTs it to `/api/upload`, which stores it in Vercel Blob under a random UUID and returns the URL.
3. If hosting isn't available (e.g. opened as a local file), it falls back to embedding the image — this works in Apple Mail and Outlook desktop, not Gmail.

The endpoint accepts only PNG/JPEG up to 512 KB, verifies the file's magic bytes, and rejects requests from other origins. Circle and rounded photo shapes are cut into the image itself (transparent PNG), because Outlook for Windows ignores `border-radius`.

Uploads are rate limited (`api/_ratelimit.js`): 20/hour and 60/day per visitor, 2,000/day overall. Visitor IPs are only kept as a salted hash for the length of the window. By default the counters live in each function instance's memory; for limits shared across instances, add **Upstash for Redis** from the Vercel Marketplace (free tier) — its env vars are picked up automatically. Optionally set `RATE_LIMIT_SALT` to a random string.

Fonts (Inter, Fraunces — SIL OFL) are self-hosted in `fonts/`, so the page makes no third-party requests.

## Contact icons

Icon artwork lives in `icons.js` (Tabler Icons, MIT) and is shared by the page and `api/icon.js`. The preview draws the SVG directly; exported signatures point at `/i/<set>/<hex>/<name>.png`, which `api/icon.js` renders to PNG with resvg (email clients don't support SVG) and the CDN caches forever. Signatures therefore depend on the production domain staying public and stable.

## Deploy to Vercel

1. Push this folder to a GitHub repo, then **Add New → Project** on vercel.com and import it (framework preset: **Other**, no build command).
   Or from this folder: `npx vercel` and follow the prompts.
2. In the project, open **Storage → Create → Blob**, choose **Public** access and the **Frankfurt (fra1)** region (matching the function region in `vercel.json`), and connect it to the project. This adds the `BLOB_READ_WRITE_TOKEN` environment variable.
3. Redeploy so the function picks up the token.
4. **Settings → Deployment Protection:** turn off Vercel Authentication for production. Otherwise the site and the icon images in sent signatures require a Vercel login.

Without step 2 the site still works; uploads fall back to embedded images.

## Local development

```bash
npm install
npx vercel dev
```

Opening `index.html` directly works too, minus image hosting.
