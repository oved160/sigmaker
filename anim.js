/*
 * Small animated accents for signatures. Email apps strip CSS/JS animation but
 * play animated GIFs, so each accent is drawn frame by frame on a canvas and
 * encoded with gifenc (MIT, vendor/gifenc.esm.js).
 *
 * Text is never turned into an image — only decorative shapes are animated, so
 * names and links stay real text (crisp, selectable, recoloured by dark modes).
 * Frame 0 is always the resting state: classic Outlook for Windows only shows
 * the first frame of a GIF.
 */
(function (root) {
  'use strict';

  const SCALE = 2; // draw at 2× so shapes stay sharp on high-density screens
  let encoderLib = null;
  const loadEncoder = () => (encoderLib ||= import('/vendor/gifenc.esm.js'));

  const hex = c => {
    const n = parseInt(c.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const mix = (a, b, t) => {
    const [r1, g1, b1] = hex(a), [r2, g2, b2] = hex(b);
    const m = (x, y) => Math.round(x + (y - x) * t);
    return `rgb(${m(r1, r2)},${m(g1, g2)},${m(b1, b2)})`;
  };

  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w * SCALE;
    c.height = h * SCALE;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.scale(SCALE, SCALE);
    return { c, ctx };
  }

  // frames: [{ rgba, delay }]; transparent backgrounds use 1-bit alpha.
  async function encode(frames, W, H, repeat) {
    const { GIFEncoder, quantize, applyPalette } = await loadEncoder();
    const format = 'rgba4444';
    const sample = new Uint8ClampedArray(frames.reduce((n, f) => n + f.rgba.length, 0));
    let off = 0;
    for (const f of frames) { sample.set(f.rgba, off); off += f.rgba.length; }
    const palette = quantize(sample, 64, { format, oneBitAlpha: 110 });
    const transparentIndex = palette.findIndex(c => c[3] === 0);
    const alpha = transparentIndex >= 0 ? { transparent: true, transparentIndex } : {};
    const gif = GIFEncoder();
    frames.forEach((f, i) => gif.writeFrame(applyPalette(f.rgba, palette, format), W, H,
      i === 0 ? { palette, delay: f.delay, repeat, dispose: 2, ...alpha } : { delay: f.delay, dispose: 2, ...alpha }));
    gif.finish();
    const bytes = gif.bytes();
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return 'data:image/gif;base64,' + btoa(bin);
  }

  // A short accent bar with a soft light gliding along it every few seconds.
  async function underline({ color, width = 56, height = 3, rtl = false }) {
    const { c, ctx } = canvas(width, height);
    const glint = mix(color, '#FFFFFF', 0.65);
    const frame = p => {
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, width, height);
      if (p !== null) {
        const band = width * 0.45;
        const x = rtl ? width + band / 2 - p * (width + band) : -band / 2 + p * (width + band);
        const g = ctx.createLinearGradient(x - band / 2, 0, x + band / 2, 0);
        g.addColorStop(0, color);
        g.addColorStop(0.5, glint);
        g.addColorStop(1, color);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, width, height);
      }
      return ctx.getImageData(0, 0, c.width, c.height).data;
    };
    const frames = [{ rgba: frame(null), delay: 2600 }];
    const steps = 18;
    for (let i = 0; i <= steps; i++) frames.push({ rgba: frame(i / steps), delay: 40 });
    return { dataUrl: await encode(frames, c.width, c.height, 0), width, height };
  }

  // A small arrow that nudges forward twice, then rests.
  async function arrow({ color, rtl = false, size = 12 }) {
    const width = size + 5, height = size;
    const { c, ctx } = canvas(width, height);
    const frame = dx => {
      ctx.clearRect(0, 0, width, height);
      ctx.save();
      if (rtl) { ctx.translate(width, 0); ctx.scale(-1, 1); }
      ctx.translate(dx, 0);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const y = height / 2, x0 = 1, x1 = size - 1;
      ctx.beginPath();
      ctx.moveTo(x0, y); ctx.lineTo(x1, y);
      ctx.moveTo(x1 - size * 0.38, y - size * 0.34); ctx.lineTo(x1, y); ctx.lineTo(x1 - size * 0.38, y + size * 0.34);
      ctx.stroke();
      ctx.restore();
      return ctx.getImageData(0, 0, c.width, c.height).data;
    };
    const frames = [{ rgba: frame(0), delay: 2400 }];
    for (const dx of [1.5, 3, 4, 3, 1.5, 0, 1.5, 3, 4, 3, 1.5]) frames.push({ rgba: frame(dx), delay: 45 });
    return { dataUrl: await encode(frames, c.width, c.height, 0), width, height };
  }

  root.SigAnim = {
    make(opts) {
      if (opts.kind === 'underline') return underline(opts);
      if (opts.kind === 'arrow') return arrow(opts);
      return Promise.reject(new Error('Unknown animation'));
    },
  };
})(window);
