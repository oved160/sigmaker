import { rateLimit } from './_ratelimit.js';
import { PreviewError, safeFetch, sniffImage, IMAGE_TYPES } from './_fetch.js';

// Reads a website's link-preview metadata (og:title / og:image, as used by
// WhatsApp, LinkedIn, Slack…) and returns the title plus the image as a data
// URI. The browser then crops the image and embeds it in the signature, so the
// card doesn't depend on the website later.
//
// User-supplied URLs are fetched through _fetch.js (public hosts only).

const LIMITS = [
  { id: 'pv-ip-h', perIp: true, limit: 30, windowSec: 60 * 60 },
  { id: 'pv-all-d', perIp: false, limit: 3000, windowSec: 24 * 60 * 60 },
];
const MAX_HTML = 1024 * 1024;
const MAX_IMAGE = 2.5 * 1024 * 1024;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

const decode = s => s
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');

function parseMeta(html) {
  const head = html.slice(0, 300000);
  const meta = {};
  for (const tag of head.match(/<meta\b[^>]*>/gi) || []) {
    const attrs = {};
    for (const [, k, , v1, v2, v3] of tag.matchAll(/([a-z:_-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
      attrs[k.toLowerCase()] = v1 ?? v2 ?? v3 ?? '';
    }
    const key = (attrs.property || attrs.name || '').toLowerCase();
    if (key && attrs.content && !(key in meta)) meta[key] = decode(attrs.content.trim());
  }
  const titleTag = (head.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1];
  return {
    title: meta['og:title'] || meta['twitter:title'] || (titleTag ? decode(titleTag.replace(/\s+/g, ' ').trim()) : ''),
    siteName: meta['og:site_name'] || '',
    image: meta['og:image:secure_url'] || meta['og:image'] || meta['og:image:url'] || meta['twitter:image'] || meta['twitter:image:src'] || '',
  };
}

export async function POST(request) {
  const origin = request.headers.get('origin');
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  try {
    if (!origin || new URL(origin).host !== host) return json({ error: 'Forbidden' }, 403);
  } catch {
    return json({ error: 'Forbidden' }, 403);
  }

  // The link comes in the body, not the query string, so it never lands in access logs.
  const { url: target = '' } = await request.json().catch(() => ({}));
  let pageUrl;
  try { pageUrl = new URL(String(target)); } catch { return json({ error: 'Enter a valid website address.' }, 400); }

  const limited = await rateLimit(request, LIMITS);
  if (!limited.ok) return json({ error: 'Too many previews — please try again later.' }, 429);

  try {
    const page = await safeFetch(pageUrl, 'text/html,application/xhtml+xml', MAX_HTML).catch(err => {
      if (err.message === 'too-large') throw new PreviewError('That page is too large to read.');
      throw err;
    });
    const type = (page.res.headers.get('content-type') || '').toLowerCase();
    if (!type.includes('html')) throw new PreviewError('That link isn’t a web page.');
    const meta = parseMeta(page.body.toString('utf8'));

    let image = '';
    if (meta.image) {
      try {
        const img = await safeFetch(new URL(meta.image, page.url), 'image/*', MAX_IMAGE);
        const kind = sniffImage(img.body);
        if (kind && IMAGE_TYPES.includes(kind)) image = `data:${kind};base64,${img.body.toString('base64')}`;
      } catch (err) {
        console.warn('Preview image fetch failed');
      }
    }

    return json({
      title: meta.title.slice(0, 120),
      siteName: meta.siteName.slice(0, 60),
      host: page.url.hostname.replace(/^www\./, ''),
      image,
    });
  } catch (err) {
    if (err instanceof PreviewError) return json({ error: err.message }, 422);
    console.error('Preview failed:', err?.name || 'error');
    const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    return json({ error: timedOut ? 'The website took too long to answer.' : 'Couldn’t read that website.' }, 502);
  }
}
