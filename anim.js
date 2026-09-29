/*
 * Animated text for signatures. Email apps strip CSS/JS animation, but play
 * animated GIFs, so a piece of text (name, title, link) is drawn frame by frame
 * on a canvas and encoded to a GIF with gifenc (MIT, vendor/gifenc.esm.js).
 *
 * The first frame is always the complete, static text: classic Outlook for
 * Windows only shows the first frame of a GIF.
 */
(function (root) {
  'use strict';

  const SCALE = 2;      // draw at 2× so text stays sharp on high-density screens
  const PAD = 1;        // CSS px of breathing room on each side (keeps inline text tight)
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
  const luminance = c => {
    const [r, g, b] = hex(c);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  };

  const graphemes = text => (typeof Intl !== 'undefined' && Intl.Segmenter)
    ? Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text), s => s.segment)
    : Array.from(text);

  /**
   * opts: { text, effect: 'shine'|'type', sizePx, weight, family, color, bg,
   *         accent, dir: 'ltr'|'rtl', uppercase, letterSpacing, chip }
   *
   * chip: '' → text on a solid `bg` rectangle.
   *       'light' | 'banner' → text on a soft rounded tint with transparent
   *       corners. Mail apps' dark modes recolour text but never images, so a
   *       solid white box stands out; a tinted chip reads as intentional on
   *       both light and dark backgrounds, and the text on it stays readable.
   * → Promise<{ dataUrl, width, height, bytes }>   (width/height in CSS px)
   */
  async function textGif(opts) {
    const { GIFEncoder, quantize, applyPalette } = await loadEncoder();
    const text = opts.uppercase ? opts.text.toUpperCase() : opts.text;
    const rtl = opts.dir === 'rtl';
    const font = `${opts.weight || 'normal'} ${opts.sizePx * SCALE}px ${opts.family}`;
    const spacing = (opts.letterSpacing || 0) * SCALE;

    const measureCtx = document.createElement('canvas').getContext('2d');
    measureCtx.font = font;
    if ('letterSpacing' in measureCtx) measureCtx.letterSpacing = `${spacing}px`;
    const measure = s => measureCtx.measureText(s).width;

    const cursorRoom = opts.effect === 'type' ? 4 : 0;
    const padX = opts.chip ? 7 : PAD;
    const width = Math.ceil(measure(text) / SCALE) + padX * 2 + cursorRoom;
    const height = Math.round(opts.sizePx * (opts.chip ? 1.55 : 1.35));
    const chipColor = opts.chip === 'banner' ? mix(opts.bg, '#FFFFFF', 0.18)
      : opts.chip ? mix(opts.accent || opts.color, '#FFFFFF', 0.87) : '';
    const W = width * SCALE, H = height * SCALE;

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    // Text is drawn on its own layer so effects only touch the letters.
    const layer = document.createElement('canvas');
    layer.width = W;
    layer.height = H;
    const lctx = layer.getContext('2d');

    const startX = rtl ? W - padX * SCALE : padX * SCALE;
    function drawText(str) {
      lctx.clearRect(0, 0, W, H);
      lctx.font = font;
      if ('letterSpacing' in lctx) lctx.letterSpacing = `${spacing}px`;
      lctx.direction = rtl ? 'rtl' : 'ltr';
      lctx.textAlign = 'start';
      lctx.textBaseline = 'middle';
      lctx.fillStyle = opts.color;
      lctx.fillText(str, startX, H / 2 + SCALE);
    }
    function compose() {
      if (chipColor) {
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = chipColor;
        ctx.beginPath();
        ctx.roundRect(0, 0, W, H, Math.min(H / 2, 7 * SCALE));
        ctx.fill();
      } else {
        ctx.fillStyle = opts.bg;
        ctx.fillRect(0, 0, W, H);
      }
      ctx.drawImage(layer, 0, 0);
      return ctx.getImageData(0, 0, W, H).data;
    }

    const frames = []; // { rgba, delay }
    const lightText = luminance(opts.color) > 0.6;

    if (opts.effect === 'shine') {
      // A soft band of light sweeps across the letters, then a long pause.
      const glint = lightText ? mix(opts.color, opts.bg, 0.5) : mix(opts.color, '#FFFFFF', chipColor ? 0.55 : 0.7);
      drawText(text);
      frames.push({ rgba: compose(), delay: 2800 });
      const steps = 16;
      const band = Math.max(40 * SCALE, W * 0.18);
      for (let i = 0; i <= steps; i++) {
        const p = i / steps;
        const x = rtl ? W + band - p * (W + band * 2) : -band + p * (W + band * 2);
        drawText(text);
        lctx.globalCompositeOperation = 'source-atop';
        const g = lctx.createLinearGradient(x - band / 2, 0, x + band / 2, H * 0.4);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(0.5, glint);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        lctx.fillStyle = g;
        lctx.fillRect(0, 0, W, H);
        lctx.globalCompositeOperation = 'source-over';
        frames.push({ rgba: compose(), delay: 45 });
      }
    } else {
      // Typewriter: full text first (for Outlook), retype with a cursor, then settle.
      const chars = graphemes(text);
      const cursorColor = opts.accent || opts.color;
      const withCursor = (str, show) => {
        drawText(str);
        if (show) {
          const w = measure(str);
          const cx = rtl ? startX - w - 2 * SCALE : startX + w + 2 * SCALE;
          lctx.fillStyle = cursorColor;
          lctx.fillRect(cx, H * 0.2, 1.5 * SCALE, H * 0.6);
        }
        return compose();
      };
      frames.push({ rgba: withCursor(text, false), delay: 2200 });
      frames.push({ rgba: withCursor('', true), delay: 350 });
      for (let i = 1; i <= chars.length; i++) {
        frames.push({ rgba: withCursor(chars.slice(0, i).join(''), true), delay: chars[i - 1] === ' ' ? 110 : 75 });
      }
      frames.push({ rgba: withCursor(text, false), delay: 380 });
      frames.push({ rgba: withCursor(text, true), delay: 380 });
      frames.push({ rgba: withCursor(text, false), delay: 1400 });
    }

    // One shared palette, sampled from a plain and an "active" frame.
    const mid = frames[Math.floor(frames.length / 2)].rgba;
    const sample = new Uint8ClampedArray(frames[0].rgba.length + mid.length);
    sample.set(frames[0].rgba);
    sample.set(mid, frames[0].rgba.length);
    // Chips need 1-bit transparency for the corners; plain text is opaque.
    const format = chipColor ? 'rgba4444' : 'rgb565';
    const palette = quantize(sample, 128, chipColor ? { format, oneBitAlpha: true } : {});
    const transparentIndex = chipColor ? palette.findIndex(c => c[3] === 0) : -1;
    const alpha = transparentIndex >= 0 ? { transparent: true, transparentIndex } : {};

    const gif = GIFEncoder();
    frames.forEach((f, i) => {
      gif.writeFrame(applyPalette(f.rgba, palette, format), W, H, i === 0
        // Shine loops forever; typing plays twice and stops on the full text.
        ? { palette, delay: f.delay, repeat: opts.effect === 'shine' ? 0 : 1, ...alpha }
        : { delay: f.delay, ...alpha });
    });
    gif.finish();
    const bytes = gif.bytes();

    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return { dataUrl: 'data:image/gif;base64,' + btoa(bin), width, height, bytes: bytes.length };
  }

  root.SigAnim = { textGif };
})(window);
