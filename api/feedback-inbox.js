import { list, del } from '@vercel/blob';
import { createHash, timingSafeEqual } from 'node:crypto';
import { rateLimit } from './_ratelimit.js';
import { blobConfigured } from './_blob.js';

// Private feedback inbox for the site owner (see /feedback-inbox).
// Every request must carry the FEEDBACK_KEY environment variable's value in
// the x-feedback-key header. A custom header can't be sent cross-site without
// CORS, which this endpoint never grants.

const LIMITS = [{ id: 'inbox-ip-h', perIp: true, limit: 60, windowSec: 60 * 60 }];
const PATH_RE = /^feedback\/[\w-]+\.json$/;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

const digest = s => createHash('sha256').update(String(s)).digest();

async function guard(request) {
  const key = process.env.FEEDBACK_KEY;
  if (!key) return json({ error: 'Add a FEEDBACK_KEY environment variable in Vercel, then redeploy.' }, 501);
  if (!blobConfigured()) return json({ error: 'Blob storage isn’t connected to this project.' }, 501);
  const limited = await rateLimit(request, LIMITS);
  if (!limited.ok) return json({ error: 'Too many attempts — try again later.' }, 429);
  if (!timingSafeEqual(digest(request.headers.get('x-feedback-key') || ''), digest(key))) {
    return json({ error: 'Wrong password.' }, 401);
  }
  return null;
}

export async function GET(request) {
  const denied = await guard(request);
  if (denied) return denied;

  const { blobs } = await list({ prefix: 'feedback/', limit: 1000 });
  const newest = blobs
    .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))
    .slice(0, 200);

  const items = await Promise.all(newest.map(async b => {
    try {
      const res = await fetch(b.url, { cache: 'no-store' });
      return { pathname: b.pathname, uploadedAt: b.uploadedAt, ...(await res.json()) };
    } catch {
      return { pathname: b.pathname, uploadedAt: b.uploadedAt, message: '(couldn’t read this message)' };
    }
  }));
  return json({ total: blobs.length, items });
}

export async function DELETE(request) {
  const denied = await guard(request);
  if (denied) return denied;

  const { pathname } = await request.json().catch(() => ({}));
  if (!PATH_RE.test(String(pathname || ''))) return json({ error: 'Invalid message id.' }, 400);
  await del(pathname);
  return json({ ok: true });
}
