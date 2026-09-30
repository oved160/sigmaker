// Upstash Redis over its REST API (no client library needed). Connected from
// the Vercel Marketplace, which sets either UPSTASH_REDIS_REST_URL / _TOKEN or
// KV_REST_API_URL / _TOKEN. Used for shared rate limits and usage counts.

const URL_ = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

export const redisConfigured = () => Boolean(URL_ && TOKEN);

// commands: [['INCR', 'key'], ...] → array of results (throws on failure).
export async function redis(commands) {
  const res = await fetch(`${URL_}/pipeline`, {
    method: 'POST',
    headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify(commands),
    signal: AbortSignal.timeout(3000),
  });
  if (!res.ok) throw new Error(`Redis ${res.status}`);
  const out = await res.json();
  return out.map(r => r.result);
}
