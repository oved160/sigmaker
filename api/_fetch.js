import dns from 'node:dns';
import net from 'node:net';
import { Agent, fetch } from 'undici';

// Fetching user-supplied URLs safely: only public http(s) hosts on standard
// ports, every redirect hop re-checked, private/internal IPs rejected, and
// time and size capped. Shared by /api/preview and /api/image.
//
// The public-IP check happens inside the connection's own DNS lookup, so the
// address that was checked is the address connected to (no DNS-rebinding gap
// between a check and a second lookup).

const TIMEOUT_MS = 6000;
const UA = 'Mozilla/5.0 (compatible; SigMakerPreview/1.0; +https://sigmaker-silk.vercel.app)';
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export class PreviewError extends Error {}

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith('::ffff:')) return isPrivateIp(v6.slice(7));
  return v6 === '::' || v6 === '::1' || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6) || v6.startsWith('64:ff9b:');
}

// DNS lookup used for every connection: resolves, then refuses private addresses.
function publicLookup(hostname, options, callback) {
  dns.lookup(hostname, { all: true }, (err, addrs) => {
    if (err) return callback(new PreviewError('Couldn’t find that website.'));
    if (!addrs.length || addrs.some(a => isPrivateIp(a.address))) {
      return callback(new PreviewError('That address isn’t a public website.'));
    }
    if (options && options.all) return callback(null, addrs);
    callback(null, addrs[0].address, addrs[0].family);
  });
}
const agent = new Agent({ connect: { lookup: publicLookup }, connections: 16 });

function assertAllowed(url) {
  if (!/^https?:$/.test(url.protocol)) throw new PreviewError('Only http(s) links are supported.');
  if (url.port && url.port !== '80' && url.port !== '443') throw new PreviewError('That link uses an unsupported port.');
  if (url.username || url.password) throw new PreviewError('Links with passwords aren’t supported.');
  // Literal IPs skip DNS, so check them here.
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host) && isPrivateIp(host)) throw new PreviewError('That address isn’t a public website.');
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
export async function safeFetch(rawUrl, accept, max) {
  let url = new URL(rawUrl);
  for (let hop = 0; hop < 4; hop++) {
    assertAllowed(url);
    let res;
    try {
      res = await fetch(url, {
        dispatcher: agent,
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { 'user-agent': UA, accept },
      });
    } catch (err) {
      // undici wraps connection errors ("fetch failed"); surface our own message.
      if (err?.cause instanceof PreviewError) throw err.cause;
      throw err;
    }
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

export function sniffImage(buf) {
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'image/webp';
  if (buf.slice(0, 3).toString() === 'GIF') return 'image/gif';
  return null;
}
