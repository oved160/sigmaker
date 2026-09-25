# SigMaker

Free, privacy-first HTML email signature generator. Static front end (`index.html`, `styles.css`, `app.js`) plus one serverless function (`api/upload.js`) that hosts signature images on Vercel Blob.

## Why images need hosting

Gmail and most webmail clients strip images embedded in a signature (`data:` URIs). The image has to live at a public `https://` URL. SigMaker:

1. Crops and resizes the upload to 240×240 in the browser (typically 5–30 KB).
2. POSTs it to `/api/upload`, which stores it in Vercel Blob under a random UUID and returns the URL.
3. If hosting isn't available (e.g. opened as a local file), it falls back to embedding the image — this works in Apple Mail and Outlook desktop, not Gmail.

The endpoint accepts only PNG/JPEG up to 512 KB, verifies the file's magic bytes, and rejects requests from other origins.

## Deploy to Vercel

1. Push this folder to a GitHub repo, then **Add New → Project** on vercel.com and import it (framework preset: **Other**, no build command).
   Or from this folder: `npx vercel` and follow the prompts.
2. In the project, open **Storage → Create → Blob**, choose **Public** access, and connect it to the project. This adds the `BLOB_READ_WRITE_TOKEN` environment variable.
3. Redeploy so the function picks up the token.

Without step 2 the site still works; uploads fall back to embedded images.

## Local development

```bash
npm install
npx vercel dev
```

Opening `index.html` directly works too, minus image hosting.
