import dns from 'node:dns/promises';
import net from 'node:net';
import { rateLimit } from './_ratelimit.js';

// Reads a website's link-preview metadata (og:title / og:image, as used by
// WhatsApp, LinkedIn, Slack…) and returns the title plus the image as a data
// URI. The browser then crops the image and embeds it in the signature, so the
// card doesn't depend on the website later.
//
// This fetches arbitrary user-supplied URLs, so it only talks to public
// http(s) hosts on standard ports, re-checks every redirect hop, and caps
// time and size.

const LIMITS = [
  { id: 'pv-ip-h', perIp: true, limit: 30, windowSec: 60 * 60 },
  { id: 'pv-all-d', perIp: false, limit: 3000, windowSec: 24 * 60 * 60 },
];
const MAX_HTML = 1024 * 1024;
const MAX_IMAGE = 2.5 * 1024 * 1024;
const TIMEOUT_MS = 6000;
const UA = 'Mozilla/5.0 (compatible; SigMakerPreview/1.0; +https://sigmaker-silk.vercel.app)';
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

class PreviewError extends Error {}

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith('::ffff:')) return isPrivateIp(v6.slice(7));
  return v6 === '::' || v6 === '::1' || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6);
}

async function assertPublic(url) {
  if (!/^https?:$/.test(url.protocol)) throw new PreviewError('Only http(s) links are supported.');
  if (url.port && url.port !== '80' && url.port !== '443') throw new PreviewError('That link uses an unsupported port.');
  if (url.username || url.password) throw new PreviewError('Links with passwords aren’t supported.');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true }).catch(() => []);
  if (!addrs.length) throw new PreviewError('Couldn’t find that website.');
  if (addrs.some(a => isPrivateIp(a.address))) throw new PreviewError('That address isn’t a public website.');
}

async function readCapped(res, max) {
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) { await reader.cancel(); throw new PreviewError('too-large'); }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

// fetch with manual redirects so every hop is checked.
async function safeFetch(rawUrl, accept, max) {
  let url = new URL(rawUrl);
  for (let hop = 0; hop < 4; hop++) {
    await assertPublic(url);
    const res = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'user-agent': UA, accept },
    });
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const loc = res.headers.get('location');
      if (!loc) throw new PreviewError('The website redirected nowhere.');
      url = new URL(loc, url);
      continue;
    }
    if (!res.ok) throw new PreviewError(`The website answered with an error (${res.status}).`);
    return { res, url, body: await readCapped(res, max) };
  }
  throw new PreviewError('Too many redirects.');
}

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

function sniffImage(buf) {
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'image/webp';
  if (buf.slice(0, 3).toString() === 'GIF') return 'image/gif';
  return null;
}

export async function GET(request) {
  const origin = request.headers.get('origin');
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  // Same-origin GETs may omit Origin; reject only explicit cross-site calls.
  if (origin) {
    try { if (new URL(origin).host !== host) return json({ error: 'Forbidden' }, 403); } catch { return json({ error: 'Forbidden' }, 403); }
  }
  if (request.headers.get('sec-fetch-site') === 'cross-site') return json({ error: 'Forbidden' }, 403);

  const target = new URL(request.url).searchParams.get('url') || '';
  let pageUrl;
  try { pageUrl = new URL(target); } catch { return json({ error: 'Enter a valid website address.' }, 400); }

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
        console.warn('Preview image fetch failed:', err.message);
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
    console.error('Preview failed:', err);
    const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    return json({ error: timedOut ? 'The website took too long to answer.' : 'Couldn’t read that website.' }, 502);
  }
}
