/*
 * Animated photo for signatures. Email apps strip CSS/JS animation but play
 * animated GIFs, so the photo is drawn frame by frame on a canvas and encoded
 * with gifenc (MIT, vendor/gifenc.esm.js).
 *
 * Dark mode: GIFs only have on/off transparency, so a soft glow can't fade into
 * an unknown background. Every effect therefore keeps the outline solid — a
 * ring (or the photo itself) whose colours animate — and the area outside and
 * the gap inside the ring stay transparent.
 *
 * Size: frame 0 is the full image; later frames store only the pixels that
 * changed (the rest is transparent, "keep previous"), so a looping ring costs
 * little on top of the photo. Frame 0 is the resting state, because classic
 * Outlook for Windows only shows the first frame.
 */
(function (root) {
  'use strict';

  const N = 240; // canvas size; the photo is displayed at 48–120px, so ≥2×
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

  const loadImg = src => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

  // Outline of the photo shape, inset by `i` pixels.
  function shapePath(ctx, shape, i, radiusRatio) {
    const s = N - i * 2;
    ctx.beginPath();
    if (shape === 'circle') ctx.arc(N / 2, N / 2, s / 2, 0, Math.PI * 2);
    else if (shape === 'rounded') ctx.roundRect(i, i, s, s, s * radiusRatio);
    else ctx.rect(i, i, s, s);
  }

  // frames: [{ rgba, delay }] — encoded with a shared palette and frame diffs.
  async function encode(frames) {
    const { GIFEncoder, quantize, applyPalette } = await loadEncoder();

    // Palette from the opaque pixels of a few representative frames.
    const picks = [0, Math.floor(frames.length / 3), Math.floor((2 * frames.length) / 3)].map(i => frames[i].rgba);
    let count = 0;
    for (const f of picks) for (let p = 3; p < f.length; p += 4) if (f[p] >= 128) count++;
    const sample = new Uint8ClampedArray(count * 4);
    let o = 0;
    for (const f of picks) {
      for (let p = 0; p < f.length; p += 4) {
        if (f[p + 3] >= 128) { sample[o++] = f[p]; sample[o++] = f[p + 1]; sample[o++] = f[p + 2]; sample[o++] = 255; }
      }
    }
    const palette = quantize(sample, 255);
    const T = palette.length;           // extra entry = transparent
    palette.push([0, 0, 0]);

    const gif = GIFEncoder();
    let prev = null;
    frames.forEach((f, i) => {
      const idx = applyPalette(f.rgba, palette.slice(0, T));
      const out = new Uint8Array(idx.length);
      for (let p = 0; p < idx.length; p++) {
        const transparent = f.rgba[p * 4 + 3] < 128 || (prev && prev[p] === idx[p]);
        out[p] = transparent ? T : idx[p];
      }
      prev = idx;
      gif.writeFrame(out, N, N, {
        ...(i === 0 ? { palette, repeat: 0 } : {}),
        delay: f.delay, transparent: true, transparentIndex: T, dispose: 1,
      });
    });
    gif.finish();
    const bytes = gif.bytes();
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return { dataUrl: 'data:image/gif;base64,' + btoa(bin), bytes: bytes.length };
  }

  /**
   * opts: { src (data URL of the shaped photo), size (display px), shape,
   *         color (accent #RRGGBB), effect: 'glow'|'orbit'|'story'|'shimmer',
   *         radiusRatio }
   */
  async function photo(opts) {
    const img = await loadImg(opts.src);
    const k = N / opts.size;                     // canvas px per display px
    const shimmer = opts.effect === 'shimmer';
    const ring = shimmer ? 0 : Math.round(3 * k); // ring thickness
    const gap = shimmer ? 0 : Math.round(2 * k);  // transparent gap inside it
    const inset = ring + gap;
    const rr = opts.radiusRatio || 1 / 6;

    const c = document.createElement('canvas');
    c.width = c.height = N;
    const ctx = c.getContext('2d', { willReadFrequently: true });

    const light = mix(opts.color, '#FFFFFF', 0.72);
    const warm = mix(opts.color, '#E0A47A', 0.6);

    function drawPhoto() {
      ctx.save();
      shapePath(ctx, opts.shape, inset, rr);
      ctx.clip();
      ctx.drawImage(img, inset, inset, N - inset * 2, N - inset * 2);
      ctx.restore();
    }
    function ringFill(style) {
      ctx.save();
      shapePath(ctx, opts.shape, 0, rr);
      // Cut the inner edge so only the ring band is filled.
      const s = N - ring * 2;
      if (opts.shape === 'circle') ctx.arc(N / 2, N / 2, s / 2, 0, Math.PI * 2);
      else if (opts.shape === 'rounded') ctx.roundRect(ring, ring, s, s, s * rr);
      else ctx.rect(ring, ring, s, s);
      ctx.fillStyle = style;
      ctx.fill('evenodd');
      ctx.restore();
    }
    const snap = () => ctx.getImageData(0, 0, N, N).data;
    const frames = [];
    const frame = (draw, delay) => {
      ctx.clearRect(0, 0, N, N);
      drawPhoto();
      draw();
      frames.push({ rgba: snap(), delay });
    };

    if (opts.effect === 'glow') {
      // The ring softly brightens twice, then rests.
      frame(() => ringFill(opts.color), 2600);
      for (let rep = 0; rep < 2; rep++) {
        for (let i = 1; i <= 10; i++) {
          const t = Math.sin((i / 10) * Math.PI);
          frame(() => ringFill(mix(opts.color, '#FFFFFF', 0.6 * t)), 55);
        }
      }
    } else if (opts.effect === 'orbit') {
      // A small light travels once around the ring.
      frame(() => ringFill(opts.color), 2200);
      const steps = 28;
      for (let i = 0; i <= steps; i++) {
        const a = -Math.PI / 2 + (i / steps) * Math.PI * 2;
        frame(() => {
          const g = ctx.createConicGradient(a - 0.9, N / 2, N / 2);
          g.addColorStop(0, opts.color);
          g.addColorStop(0.12, light);
          g.addColorStop(0.15, '#FFFFFF');
          g.addColorStop(0.2, opts.color);
          g.addColorStop(1, opts.color);
          ringFill(g);
        }, 40);
      }
    } else if (opts.effect === 'story') {
      // A soft gradient ring that slowly turns (Instagram-story style).
      const steps = 24;
      const gradAt = a => {
        const g = ctx.createConicGradient(a, N / 2, N / 2);
        g.addColorStop(0, opts.color);
        g.addColorStop(0.33, warm);
        g.addColorStop(0.66, light);
        g.addColorStop(1, opts.color);
        return g;
      };
      frame(() => ringFill(gradAt(0)), 1200);
      for (let i = 1; i < steps; i++) frame(() => ringFill(gradAt((i / steps) * Math.PI * 2)), 70);
    } else {
      // Shimmer: a soft diagonal light sweeps across the photo itself.
      frame(() => {}, 2800);
      // Few, wide steps with a narrow band keep the changed area per frame small.
      const steps = 9;
      for (let i = 0; i <= steps; i++) {
        const x = -N * 0.2 + (i / steps) * N * 1.4;
        frame(() => {
          ctx.save();
          shapePath(ctx, opts.shape, inset, rr);
          ctx.clip();
          const g = ctx.createLinearGradient(x - N * 0.13, 0, x + N * 0.13, N * 0.35);
          g.addColorStop(0, 'rgba(255,255,255,0)');
          g.addColorStop(0.5, 'rgba(255,255,255,0.42)');
          g.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, N, N);
          ctx.restore();
        }, 60);
      }
    }

    const { dataUrl, bytes } = await encode(frames);
    return { dataUrl, bytes, width: opts.size, height: opts.size };
  }

  root.SigAnim = {
    make(opts) {
      if (opts.kind === 'photo') return photo(opts);
      return Promise.reject(new Error('Unknown animation'));
    },
  };
})(window);
