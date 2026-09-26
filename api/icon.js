import { Resvg } from '@resvg/resvg-js';
import '../icons.js';

// Email clients don't render SVG, so signature icons are served as PNGs
// rendered on demand in the signature's accent colour. Served via the
// rewrite /i/:set/:color/:name.png in vercel.json.
const { SETS, NAMES, svg } = globalThis.SIG_ICONS;
const PX = 64; // displayed at 14–22px, so this stays sharp on 3× screens

export function GET(request) {
  const q = new URL(request.url).searchParams;
  const set = q.get('s');
  const name = q.get('n');
  const color = (q.get('c') || '').toLowerCase();

  if (!SETS.includes(set) || !NAMES.includes(name) || !/^[0-9a-f]{6}$/.test(color)) {
    return new Response('Not found', { status: 404 });
  }

  const png = new Resvg(svg(set, name, '#' + color), { fitTo: { mode: 'width', value: PX } })
    .render()
    .asPng();

  return new Response(png, {
    headers: {
      'content-type': 'image/png',
      // Output is fully determined by the URL, so cache it forever at the edge.
      'cache-control': 'public, max-age=31536000, s-maxage=31536000, immutable',
      'access-control-allow-origin': '*',
    },
  });
}
