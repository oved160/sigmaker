import { put } from '@vercel/blob';

// Signature images are resized in the browser to ~240px before upload,
// so anything bigger than this isn't coming from SigMaker.
const MAX_BYTES = 512 * 1024;
const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png' };

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

// Check the file's magic bytes rather than trusting the declared type.
function sniff(buf) {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  return null;
}

export async function POST(request) {
  // Only accept uploads from pages served by this deployment.
  const origin = request.headers.get('origin');
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  try {
    if (!origin || new URL(origin).host !== host) return json({ error: 'Forbidden' }, 403);
  } catch {
    return json({ error: 'Forbidden' }, 403);
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return json({ error: 'Image hosting is not configured on this deployment.' }, 501);
  }

  const type = (request.headers.get('content-type') || '').split(';')[0].trim();
  if (!TYPES[type]) return json({ error: 'Only PNG or JPEG images are accepted.' }, 415);

  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > MAX_BYTES) return json({ error: 'Image is too large.' }, 413);

  const buf = Buffer.from(await request.arrayBuffer());
  if (!buf.length || buf.length > MAX_BYTES) return json({ error: 'Image is too large.' }, 413);
  if (sniff(buf) !== type) return json({ error: 'File is not a valid image.' }, 415);

  try {
    const blob = await put(`signatures/${crypto.randomUUID()}.${TYPES[type]}`, buf, {
      access: 'public',
      contentType: type,
      cacheControlMaxAge: 60 * 60 * 24 * 365,
    });
    return json({ url: blob.url });
  } catch (err) {
    console.error('Blob upload failed:', err);
    return json({ error: 'Upload failed. Please try again.' }, 502);
  }
}
