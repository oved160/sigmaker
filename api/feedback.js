import { put } from '@vercel/blob';
import { rateLimit } from './_ratelimit.js';
import { blobConfigured } from './_blob.js';

// Stores visitor feedback in the Blob store under feedback/, one JSON file per
// message at a random path. Read them in Vercel → Storage → Blob → feedback/.
// No IP address or other identifier is stored — only what the visitor typed.

const LIMITS = [
  { id: 'fb-ip-h', perIp: true, limit: 5, windowSec: 60 * 60 },
  { id: 'fb-all-d', perIp: false, limit: 300, windowSec: 24 * 60 * 60 },
];
const MAX_BODY = 16 * 1024;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

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
  if (!blobConfigured()) return json({ error: 'Feedback isn’t set up on this deployment.' }, 501);

  const raw = await request.text();
  if (raw.length > MAX_BODY) return json({ error: 'That message is too long.' }, 413);
  let data;
  try { data = JSON.parse(raw); } catch { return json({ error: 'Invalid request.' }, 400); }

  // Honeypot: a field real visitors never see. Pretend success for bots.
  if (data.company) return json({ ok: true });

  const message = String(data.message || '').trim();
  const email = String(data.email || '').trim();
  if (message.length < 3) return json({ error: 'Please write a little more.' }, 400);
  if (message.length > 3000) return json({ error: 'Please keep it under 3,000 characters.' }, 400);
  if (email && (email.length > 200 || !EMAIL_RE.test(email))) return json({ error: 'That email address doesn’t look right.' }, 400);

  const limited = await rateLimit(request, LIMITS);
  if (!limited.ok) return json({ error: 'Thanks! You’ve sent a lot of feedback — please try again later.' }, 429);

  const createdAt = new Date().toISOString();
  try {
    await put(`feedback/${createdAt.slice(0, 10)}-${crypto.randomUUID()}.json`, JSON.stringify({
      createdAt,
      message,
      email: email || null,
      kind: ['idea', 'bug', 'other'].includes(data.kind) ? data.kind : 'other',
    }, null, 2), {
      access: 'public',
      contentType: 'application/json',
      cacheControlMaxAge: 60,
    });
    return json({ ok: true });
  } catch (err) {
    console.error('Feedback save failed:', err);
    return json({ error: 'Couldn’t send your feedback. Please try again.' }, 502);
  }
}
