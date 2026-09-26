import { createHash } from 'node:crypto';

// Fixed-window counters for upload abuse protection.
//
// With an Upstash Redis store connected (Vercel Marketplace → Upstash, which sets
// KV_REST_API_URL / KV_REST_API_TOKEN or UPSTASH_REDIS_REST_URL / _TOKEN) the
// limits are shared across every function instance. Without it they fall back
// to per-instance memory: weaker, but still stops a single burst.

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

const memory = new Map(); // key -> { count, resetAt }

async function incrRedis(key, windowSec) {
  const res = await fetch(`${REDIS_URL}/pipeline`, {
    method: 'POST',
    headers: { authorization: `Bearer ${REDIS_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify([['INCR', key], ['EXPIRE', key, String(windowSec), 'NX']]),
  });
  if (!res.ok) throw new Error(`Redis ${res.status}`);
  const [incr] = await res.json();
  return Number(incr.result);
}

function incrMemory(key, windowSec) {
  const now = Date.now();
  let entry = memory.get(key);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + windowSec * 1000 };
    memory.set(key, entry);
  }
  entry.count += 1;
  if (memory.size > 5000) {
    for (const [k, v] of memory) if (v.resetAt <= now) memory.delete(k);
  }
  return entry.count;
}

async function incr(key, windowSec) {
  if (REDIS_URL && REDIS_TOKEN) {
    try {
      return await incrRedis(key, windowSec);
    } catch (err) {
      console.error('Rate limit store unavailable, using memory:', err.message);
    }
  }
  return incrMemory(key, windowSec);
}

// IPs are only kept as a salted hash for the length of the window.
const hashIp = ip =>
  createHash('sha256').update(`${process.env.RATE_LIMIT_SALT || 'sigmaker'}:${ip}`).digest('hex').slice(0, 32);

export function clientIp(request) {
  return (request.headers.get('x-forwarded-for') || '').split(',')[0].trim()
    || request.headers.get('x-real-ip')
    || 'unknown';
}

/**
 * Checks each rule in order; returns { ok: true } or { ok: false, retryAfter }.
 * rule: { id, limit, windowSec, perIp }
 */
export async function rateLimit(request, rules) {
  const ipKey = hashIp(clientIp(request));
  for (const rule of rules) {
    const windowStart = Math.floor(Date.now() / 1000 / rule.windowSec);
    const key = `rl:${rule.id}:${rule.perIp ? ipKey : 'all'}:${windowStart}`;
    const count = await incr(key, rule.windowSec);
    if (count > rule.limit) {
      const retryAfter = (windowStart + 1) * rule.windowSec - Math.floor(Date.now() / 1000);
      return { ok: false, retryAfter: Math.max(1, retryAfter) };
    }
  }
  return { ok: true };
}
