import { rateLimit } from './_ratelimit.js';
import { PreviewError, safeFetch, sniffImage, IMAGE_TYPES } from './_fetch.js';

// Fetches a pasted photo link (Drive, Dropbox, any public image) and returns
// it as a data URI, so the browser can crop, shape and embed it exactly like
// an uploaded photo. Mail apps strip object-fit, so a linked non-square photo
// would otherwise be squashed into the square slot.

const LIMITS = [
  { id: 'img-ip-h', perIp: true, limit: 60, windowSec: 60 * 60 },
  { id: 'img-all-d', perIp: false, limit: 5000, windowSec: 24 * 60 * 60 },
];
const MAX_IMAGE = 4 * 1024 * 1024;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

export async function POST(request) {
  const origin = request.headers.get('origin');
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  try {
    if (!origin || new URL(origin).host !== host) return json({ error: 'Forbidden' }, 403);
  } catch {
    return json({ error: 'Forbidden' }, 403);
  }

  // The link comes in the body, not the query string, so it never lands in access logs.
  const { url = '' } = await request.json().catch(() => ({}));
  let target;
  try { target = new URL(String(url)); } catch { return json({ error: 'Enter a valid image link.' }, 400); }

  const limited = await rateLimit(request, LIMITS);
  if (!limited.ok) return json({ error: 'Too many requests — please try again later.' }, 429);

  try {
    const img = await safeFetch(target, 'image/*', MAX_IMAGE).catch(err => {
      if (err.message === 'too-large') throw new PreviewError('That image is over 4 MB.');
      throw err;
    });
    const kind = sniffImage(img.body);
    if (!kind || !IMAGE_TYPES.includes(kind)) {
      throw new PreviewError('That link doesn’t point to an image (it may be a page, or private).');
    }
    return json({ image: `data:${kind};base64,${img.body.toString('base64')}` });
  } catch (err) {
    if (err instanceof PreviewError) return json({ error: err.message }, 422);
    const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    return json({ error: timedOut ? 'The image took too long to load.' : 'Couldn’t load that image.' }, 502);
  }
}
