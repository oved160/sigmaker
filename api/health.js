import { blobConfigured } from './_blob.js';
import { redis, redisConfigured } from './_redis.js';

// Public health check: which services are connected and whether Redis answers.
// Reports only yes/no — never names, values or data.
export async function GET() {
  let redisOk = false;
  if (redisConfigured()) {
    try { redisOk = (await redis([['PING']]))[0] === 'PONG'; } catch { redisOk = false; }
  }
  return new Response(JSON.stringify({
    storage: blobConfigured(),
    database: { configured: redisConfigured(), reachable: redisOk },
    feedbackKey: (process.env.FEEDBACK_KEY || '').length >= 16,
  }), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}
