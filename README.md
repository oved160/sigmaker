# SigMaker

**Live: [sigmaker-silk.vercel.app](https://sigmaker-silk.vercel.app)** · by [Oved Elisha](https://www.linkedin.com/in/oved-elisha-3ba8851aa/)

Free, privacy-first HTML email signature generator. Static front end (`index.html`, `styles.css`, `app.js`) plus serverless functions for contact icons (`api/icon.js`) and optional photo hosting (`api/upload.js`, Vercel Blob).

## Photos: embedded by default

The photo never leaves the browser unless the user opts in. SigMaker crops, shapes and resizes it to 240×240 and embeds it in the signature as a `data:` URI. Tested in Gmail: pasting the signature turns the photo into an inline attachment (`cid:`) of every email sent, so it displays for recipients and never depends on a server. A downscaled original (`photoOrig`, max 480px) stays in the page state so shape/fit can be changed later.

Linked images (`https://…`) are kept as links by Gmail, so they only keep working while the link does. Pasted Google Drive and Dropbox share links are converted to direct image links.

**Optional hosting** ("Also host my photo online"): for mail apps that drop embedded images, the processed photo is POSTed to `/api/upload`, stored in Vercel Blob under a random UUID, and the signature links to it. The endpoint accepts only PNG/JPEG up to 512 KB, verifies the file's magic bytes, and rejects requests from other origins. Circle and rounded photo shapes are cut into the image itself (transparent PNG), because Outlook for Windows ignores `border-radius`.

Uploads are rate limited (`api/_ratelimit.js`): 20/hour and 60/day per visitor, 2,000/day overall. Visitor IPs are only kept as a salted hash for the length of the window. By default the counters live in each function instance's memory; for limits shared across instances, add **Upstash for Redis** from the Vercel Marketplace (free tier) — its env vars are picked up automatically. Optionally set `RATE_LIMIT_SALT` to a random string.

Fonts (Inter, Fraunces — SIL OFL) are self-hosted in `fonts/`, so the page makes no third-party requests.

## Feedback

The **Feedback** button (header and footer) posts to `api/feedback.js`, which saves each message as a JSON file under `feedback/` in the Blob store (random filename, no IP or other identifiers). Read them at **`/feedback-inbox`** — a private page (not linked, `noindex`) protected by the `FEEDBACK_KEY` environment variable, with delete — or in Vercel → **Storage → Blob → feedback/**. Limits: 10/hour per network, 300/day overall. The form only reports success when the server returns the saved file’s URL.

## Photo animation

Email apps strip CSS/JS animation but play animated GIFs, so the optional photo animation is drawn frame by frame on a canvas and encoded to GIF in the browser by `anim.js`, using [gifenc](https://github.com/mattdesl/gifenc) (MIT, vendored in `vendor/`). Styles: **Glow** (ring brightens twice), **Orbit** (a light travels around the ring), **Story ring** (a gradient ring turns) and **Shimmer** (a light sweeps across the photo).

- **Dark mode:** GIFs only have on/off transparency, so a soft glow can't fade into an unknown background. Every style keeps a solid outline (a ring, or the photo itself) whose colours animate; outside it stays transparent. The preview's **Dark** toggle approximates Gmail's phone dark mode.
- **Size:** frame 0 is the full photo; later frames contain only changed pixels (transparent = keep previous), so results are ~50–125 KB, within the usual ≤150 KB guidance.
- **Outlook:** frame 0 is the resting state, since classic Outlook for Windows shows only the first frame.
- **Pulsing button:** the call-to-action button can gently brighten twice (arrow nudging) every few seconds — an image of the button (~19 KB) with a solid fill and transparent rounded corners, linked like the regular button.
- Other text is never turned into an image — it can't match real text or follow dark mode.

## Usage counts

`api/track.js` counts two anonymous events as daily totals in Upstash Redis: `visit` (once per browser per day, deduped with a date in localStorage) and `export` (a signature copied or downloaded, once per visit). No cookies, IPs or identifiers; browsers sending Do Not Track / Global Privacy Control aren't counted. Totals and a 14-day chart appear in the private `/feedback-inbox` dashboard. Without Upstash connected, tracking is a no-op.

## Security notes

- Link fetching (`api/_fetch.js`): public http(s) hosts on ports 80/443 only; the public-IP check runs inside the connection's own DNS lookup (undici `Agent`), so there's no DNS-rebinding gap; redirects re-checked; time and size capped. Links are sent in POST bodies, never query strings, so they stay out of access logs.
- All endpoints that write or fetch require a same-origin `Origin` header and are rate limited per network (`api/_ratelimit.js`, salted-hash keys; shared via Upstash when connected).
- The dashboard requires `FEEDBACK_KEY` (≥ 16 characters) in a header, compared in constant time.
- Headers: strict CSP (self only, no inline scripts), HSTS, `X-Frame-Options: DENY`, `nosniff`, `no-referrer`, COOP.
- User input in the signature is HTML-escaped; the dashboard renders feedback with `textContent` only.

## Contact icons

Icon artwork lives in `icons.js` (Tabler Icons, MIT). The preview draws the SVG directly; exported signatures embed each icon as a small PNG rendered in the browser, so sent signatures never load anything from this server. `api/icon.js` (resvg, CDN-cached, rate limited) still serves `/i/<set>/<hex>/<name>.png` for signatures created before icons were embedded.

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

## License

SigMaker is released under the [MIT License](LICENSE).

Third-party components keep their own licences:

- Icons — [Tabler Icons](https://tabler.io/icons), MIT (`icons.js`)
- GIF encoder — [gifenc](https://github.com/mattdesl/gifenc) by Matt DesLauriers, MIT (`vendor/`)
- Fonts — [Inter](https://github.com/rsms/inter) and [Fraunces](https://github.com/undercasetype/Fraunces), SIL Open Font License 1.1 (`fonts/`)
- Server dependencies (`@vercel/blob`, `@resvg/resvg-js`, `undici`) under their respective licences via npm
