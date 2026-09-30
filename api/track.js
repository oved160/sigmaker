import { rateLimit } from './_ratelimit.js';
import { redis, redisConfigured } from './_redis.js';

// Anonymous usage counts: daily totals per event, nothing else. No cookies, no
// IP addresses, no identifiers are stored — only counters like
// stats:export:2026-09-30. Shown in the private /feedback-inbox panel.
//   visit  — a browser opened SigMaker (counted once per day per browser)
//   export — someone copied or downloaded a signature (once per visit)

const EVENTS = ['visit', 'export'];
const LIMITS = [{ id: 'trk-ip-h', perIp: true, limit: 60, windowSec: 60 * 60 }];
const KEEP_DAYS = 400;

const noContent = () => new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });

export async function POST(request) {
  const origin = request.headers.get('origin');
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  try {
    if (!origin || new URL(origin).host !== host) return new Response(null, { status: 403 });
  } catch {
    return new Response(null, { status: 403 });
  }
  if (!redisConfigured()) return noContent();

  const { event } = await request.json().catch(() => ({}));
  if (!EVENTS.includes(event)) return new Response(null, { status: 400 });

  // Caps how much one network can inflate the numbers.
  const limited = await rateLimit(request, LIMITS);
  if (!limited.ok) return noContent();

  const day = new Date().toISOString().slice(0, 10);
  const dayKey = `stats:${event}:${day}`;
  try {
    await redis([
      ['INCR', dayKey],
      ['EXPIRE', dayKey, String(KEEP_DAYS * 86400), 'NX'],
      ['INCR', `stats:${event}:total`],
    ]);
  } catch {
    // Counting must never affect the user; drop silently.
  }
  return noContent();
}
