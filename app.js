(() => {
  'use strict';

  const STORAGE_KEY = 'sigmaker:v1';

  const ACCENTS = ['#2C2C2C', '#4A6B5D', '#3E5C76', '#A0633F', '#8C4A5B', '#6B5B95', '#B08D3C'];

  const SAMPLE = {
    name: 'Astrid Lindqvist',
    title: 'Product Designer',
    company: 'Nordvik Studio',
    pronouns: '',
    email: 'astrid@nordvik.studio',
    phone: '+46 70 123 45 67',
    website: 'nordvik.studio',
    address: 'Stockholm, Sweden',
    linkedin: 'linkedin.com/in/astrid',
    github: '',
    twitter: '',
    portfolio: '',
    photo: '',
    photoData: '',
    photoFit: 'cover',
    photoShape: 'circle',
    photoSize: '72',
    font: 'Helvetica, Arial, sans-serif',
    fontSize: '13',
    signoff: '',
    ctaText: '',
    ctaUrl: '',
    disclaimer: '',
    accent: '#4A6B5D',
    iconStyle: 'line',
    template: 'classic',
  };

  // 'text' = letter/word labels, 'none' = no labels, others = icon sets from icons.js
  const ICON_STYLES = [
    { id: 'none', name: 'None' },
    { id: 'text', name: 'Text' },
    { id: 'line', name: 'Line' },
    { id: 'solid', name: 'Solid' },
    { id: 'badge', name: 'Badge' },
  ];
  const { svg: iconSvg, SETS: ICON_SETS } = window.SIG_ICONS;

  // Exported signatures reference PNG icons on this deployment (email clients
  // can't show SVG). Local/dev pages have no public host, so they embed SVG.
  const ICON_HOST = /^https?:$/.test(location.protocol) &&
    !/^(localhost|127\.|\[::1\]|0\.0\.0\.0)/.test(location.hostname) ? location.origin : '';

  const EMPTY = Object.fromEntries(Object.keys(SAMPLE).map(k => [k, '']));
  Object.assign(EMPTY, {
    photoShape: 'circle', photoFit: 'cover', photoSize: '72', font: SAMPLE.font, fontSize: '13',
    accent: '#2C2C2C', iconStyle: 'line', template: 'classic',
  });

  const FONTS = [...document.querySelectorAll('select[data-key="font"] option')].map(o => o.value);

  // ---------- Helpers ----------
  const esc = s => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  // Only allow http(s) links; add https:// when the scheme is omitted.
  function toUrl(raw) {
    const v = String(raw || '').trim();
    if (!v) return '';
    const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : 'https://' + v.replace(/^\/+/, '');
    try {
      const u = new URL(withScheme);
      return (u.protocol === 'http:' || u.protocol === 'https:') ? u.href : '';
    } catch { return ''; }
  }
  const prettyUrl = href => href.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
  const telHref = p => 'tel:' + p.replace(/[^\d+]/g, '');
  const mailHref = e => 'mailto:' + encodeURIComponent(e.trim()).replace(/%40/g, '@');
  const isHex = c => /^#[0-9a-f]{6}$/i.test(c);
  const isImageData = d => /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(String(d || ''));

  // ---------- Data shaping ----------
  function iconSrc(set, name, color, forExport) {
    if (forExport && ICON_HOST) return `${ICON_HOST}/i/${set}/${color.slice(1).toLowerCase()}/${name}.png`;
    return 'data:image/svg+xml,' + encodeURIComponent(iconSvg(set, name, color));
  }

  function model(s, forExport = false) {
    const accent = isHex(s.accent) ? s.accent : '#2C2C2C';
    const fs = Number(s.fontSize) || 13;
    const photoSize = Math.min(120, Math.max(48, Number(s.photoSize) || 72));
    const radius = s.photoShape === 'circle' ? '50%' : s.photoShape === 'rounded' ? '12px' : '0';
    const iconStyle = ICON_STYLES.some(x => x.id === s.iconStyle) ? s.iconStyle : 'line';
    const iconSet = ICON_SETS.includes(iconStyle) ? iconStyle : '';

    const contacts = [];
    if (s.phone.trim()) contacts.push({ label: 'P', word: 'Phone', icon: 'phone', text: s.phone.trim(), href: telHref(s.phone) });
    if (s.email.trim()) contacts.push({ label: 'E', word: 'Email', icon: 'email', text: s.email.trim(), href: mailHref(s.email) });
    const site = toUrl(s.website);
    if (site) contacts.push({ label: 'W', word: 'Web', icon: 'website', text: prettyUrl(site), href: site });
    if (s.address.trim()) contacts.push({ label: 'A', word: 'Based in', icon: 'location', text: s.address.trim(), href: '' });

    const socials = [
      ['LinkedIn', 'linkedin', s.linkedin], ['GitHub', 'github', s.github], ['X', 'x', s.twitter], ['Portfolio', 'link', s.portfolio],
    ].map(([label, icon, v]) => ({ label, icon, href: toUrl(v) })).filter(x => x.href);

    return {
      iconStyle, iconSet,
      icon: name => iconSrc(iconSet, name, accent, forExport),
      name: s.name.trim(),
      title: s.title.trim(),
      company: s.company.trim(),
      pronouns: s.pronouns.trim(),
      // A hosted link wins; an embedded image is the fallback when hosting isn't available.
      photo: toUrl(s.photo) || (isImageData(s.photoData) ? s.photoData : ''),
      photoFit: s.photoFit === 'contain' ? 'contain' : 'cover',
      photoSize, radius,
      // Only fonts offered in the picker (values are trusted, never user-typed)
      font: FONTS.includes(s.font) ? s.font : SAMPLE.font,
      fs, accent,
      contacts, socials,
      signoff: s.signoff.trim(),
      cta: s.ctaText.trim() && toUrl(s.ctaUrl) ? { text: s.ctaText.trim(), href: toUrl(s.ctaUrl) } : null,
      disclaimer: s.disclaimer.trim(),
    };
  }

  // ---------- Signature building blocks (email-safe, inline styles) ----------
  const TEXT = '#2C2C2C';
  const MUTED = '#6F6A63';

  const link = (m, href, text, color = TEXT) =>
    `<a href="${esc(href)}" style="color:${color};text-decoration:none;">${esc(text)}</a>`;

  function nameLine(m, size) {
    if (!m.name) return '';
    const pro = m.pronouns
      ? ` <span style="font-weight:normal;font-size:${m.fs - 1}px;color:${MUTED};">(${esc(m.pronouns)})</span>` : '';
    return `<div style="font-size:${size}px;line-height:1.25;font-weight:bold;color:${TEXT};margin:0;">${esc(m.name)}${pro}</div>`;
  }

  function roleLine(m, { accentTitle = true, joiner = ', ' } = {}) {
    if (!m.title && !m.company) return '';
    const t = m.title ? `<span style="color:${accentTitle ? m.accent : TEXT};">${esc(m.title)}</span>` : '';
    const c = m.company ? `<span style="color:${MUTED};">${esc(m.company)}</span>` : '';
    return `<div style="font-size:${m.fs}px;line-height:1.5;margin:2px 0 0;">${[t, c].filter(Boolean).join(`<span style="color:${MUTED};">${joiner}</span>`)}</div>`;
  }

  const TABLE = 'cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse;"';

  // Contact icons scale with the text; badges carry their own padding so run a bit larger.
  const iconSize = m => m.fs + (m.iconSet === 'badge' ? 5 : 2);

  function iconImg(m, name, size = iconSize(m), alt = '') {
    return `<img src="${esc(m.icon(name))}" width="${size}" height="${size}" alt="${esc(alt)}" style="display:inline-block;width:${size}px;height:${size}px;border:0;vertical-align:middle;" />`;
  }

  const contactValue = (m, c) =>
    c.href ? link(m, c.href, c.text) : `<span style="color:${TEXT};">${esc(c.text)}</span>`;

  // One contact per line: [icon | letter] value
  function contactRows(m) {
    if (!m.contacts.length) return '';
    if (m.iconSet) {
      return `<table ${TABLE}>${m.contacts.map(c => `<tr>
        <td valign="middle" style="padding:2px 8px 2px 0;line-height:0;">${iconImg(m, c.icon)}</td>
        <td valign="middle" style="padding:2px 0;font-size:${m.fs}px;line-height:1.5;">${contactValue(m, c)}</td>
      </tr>`).join('')}</table>`;
    }
    return m.contacts.map(c => {
      const lab = m.iconStyle === 'text' ? `<span style="color:${m.accent};font-weight:bold;">${c.label}</span>&nbsp;&nbsp;` : '';
      return `<div style="font-size:${m.fs}px;line-height:1.6;">${lab}${contactValue(m, c)}</div>`;
    }).join('');
  }

  // All contacts on one wrapping line
  function contactInline(m, sep = ' &nbsp;·&nbsp; ', color = TEXT) {
    if (!m.contacts.length) return '';
    const items = m.contacts.map(c => {
      const val = c.href ? link(m, c.href, c.text, color) : `<span style="color:${color};">${esc(c.text)}</span>`;
      if (m.iconSet) return `<span style="white-space:nowrap;">${iconImg(m, c.icon)}&nbsp;${val}</span>`;
      if (m.iconStyle === 'text') return `<span style="white-space:nowrap;"><span style="color:${m.accent};font-weight:bold;">${c.label}</span>&nbsp;${val}</span>`;
      return val;
    });
    const gap = m.iconSet ? ' &nbsp;&nbsp; ' : sep;
    return `<div style="font-size:${m.fs}px;line-height:1.8;color:${MUTED};">${items.join(`<span style="color:${MUTED};">${gap}</span>`)}</div>`;
  }

  function socialIcons(m) {
    const size = m.iconSet === 'badge' ? 24 : 20;
    const cells = m.socials.map(s =>
      `<td style="padding:0 8px 0 0;line-height:0;"><a href="${esc(s.href)}" style="text-decoration:none;">${iconImg(m, s.icon, size, s.label)}</a></td>`
    ).join('');
    return `<table ${TABLE.replace('style="', 'style="margin-top:10px;')}><tr>${cells}</tr></table>`;
  }

  function socialLine(m, { pill = false } = {}) {
    if (!m.socials.length) return '';
    if (m.iconSet) return socialIcons(m);
    if (pill) {
      const cells = m.socials.map(s =>
        `<td style="padding:0 6px 0 0;"><a href="${esc(s.href)}" style="display:inline-block;padding:3px 10px;border:1px solid ${m.accent};border-radius:12px;color:${m.accent};font-size:${m.fs - 1}px;text-decoration:none;">${esc(s.label)}</a></td>`
      ).join('');
      return `<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse;margin-top:10px;"><tr>${cells}</tr></table>`;
    }
    const items = m.socials.map(s => link(m, s.href, s.label, m.accent));
    return `<div style="font-size:${m.fs}px;line-height:1.6;margin-top:8px;font-weight:bold;">${items.join(`<span style="color:${MUTED};font-weight:normal;"> &nbsp;·&nbsp; </span>`)}</div>`;
  }

  function photoImg(m, size = m.photoSize) {
    if (!m.photo) return '';
    return `<img src="${esc(m.photo)}" width="${size}" height="${size}" alt="${esc(m.name || 'Photo')}" style="display:block;width:${size}px;height:${size}px;border-radius:${m.radius};object-fit:${m.photoFit};border:0;" />`;
  }

  function ctaButton(m) {
    if (!m.cta) return '';
    return `<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse;margin-top:12px;"><tr><td style="background:${m.accent};border-radius:6px;"><a href="${esc(m.cta.href)}" style="display:inline-block;padding:8px 16px;color:#FFFFFF;font-size:${m.fs}px;font-weight:bold;text-decoration:none;">${esc(m.cta.text)} &rarr;</a></td></tr></table>`;
  }

  function extras(m) {
    return m.disclaimer
      ? `<div style="font-size:${m.fs - 2}px;line-height:1.5;color:${MUTED};margin-top:14px;max-width:460px;">${esc(m.disclaimer).replace(/\n/g, '<br />')}</div>`
      : '';
  }

  const signoff = m => m.signoff
    ? `<div style="font-size:${m.fs + 1}px;line-height:1.5;color:${TEXT};margin:0 0 12px;">${esc(m.signoff)}</div>` : '';

  const wrap = (m, inner) =>
    `<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse;font-family:${m.font};color:${TEXT};">${inner}</table>`;

  // ---------- Templates ----------
  const TEMPLATES = {
    classic: {
      name: 'Classic',
      thumb: [['i', 10, 14, 26, 26, '50%'], ['a', 42, 10, 2, 34], ['i', 50, 12, 40, 6], ['a', 50, 22, 28, 4], ['i', 50, 32, 46, 3], ['i', 50, 39, 38, 3]],
      build(m) {
        const left = m.photo
          ? `<td valign="top" style="padding:0 16px 0 0;">${photoImg(m)}</td>
             <td valign="top" style="width:2px;background:${m.accent};font-size:0;line-height:0;">&nbsp;</td>
             <td valign="top" style="padding:0 0 0 16px;">`
          : `<td valign="top" style="border-left:2px solid ${m.accent};padding:0 0 0 16px;">`;
        return signoff(m) + wrap(m, `<tr>${left}
          ${nameLine(m, m.fs + 5)}
          ${roleLine(m)}
          <div style="height:10px;line-height:10px;font-size:0;">&nbsp;</div>
          ${contactRows(m)}
          ${socialLine(m)}
          ${ctaButton(m)}
        </td></tr>`) + extras(m);
      },
    },

    modern: {
      name: 'Modern',
      thumb: [['i', 10, 10, 56, 8], ['a', 10, 22, 34, 4], ['a', 10, 31, 90, 1], ['i', 10, 37, 24, 3], ['i', 38, 37, 24, 3], ['i', 66, 37, 24, 3]],
      build(m) {
        const photo = m.photo ? `<td valign="middle" style="padding:0 18px 0 0;">${photoImg(m)}</td>` : '';
        return signoff(m) + wrap(m, `<tr>${photo}<td valign="middle">
          ${nameLine(m, m.fs + 9)}
          ${m.title || m.company ? `<div style="font-size:${m.fs - 1}px;line-height:1.5;margin-top:4px;letter-spacing:1.5px;text-transform:uppercase;color:${m.accent};font-weight:bold;">${esc([m.title, m.company].filter(Boolean).join(' · '))}</div>` : ''}
          </td></tr>
          <tr><td colspan="${m.photo ? 2 : 1}" style="padding:12px 0 0;">
            <div style="border-top:1px solid ${m.accent};height:1px;line-height:1px;font-size:0;max-width:460px;">&nbsp;</div>
          </td></tr>
          <tr><td colspan="${m.photo ? 2 : 1}" style="padding:10px 0 0;">
            ${contactInline(m)}
            ${socialLine(m, { pill: true })}
            ${ctaButton(m)}
          </td></tr>`) + extras(m);
      },
    },

    minimal: {
      name: 'Minimal',
      thumb: [['i', 10, 14, 44, 6], ['i', 10, 25, 64, 3], ['a', 10, 34, 80, 3]],
      build(m) {
        const role = [m.title, m.company].filter(Boolean).map(esc).join(', ');
        const contacts = m.contacts.map(c => {
          const val = c.href ? link(m, c.href, c.text, TEXT) : esc(c.text);
          return m.iconSet ? `<span style="white-space:nowrap;">${iconImg(m, c.icon, m.fs)}&nbsp;${val}</span>` : val;
        });
        const socials = m.iconSet
          ? (m.socials.length ? [m.socials.map(s => `<a href="${esc(s.href)}" style="text-decoration:none;">${iconImg(m, s.icon, m.fs + 3, s.label)}</a>`).join('&nbsp;&nbsp;')] : [])
          : m.socials.map(s => link(m, s.href, s.label, m.accent));
        return signoff(m) + wrap(m, `<tr><td>
          ${m.name ? `<div style="font-size:${m.fs + 1}px;line-height:1.5;font-weight:bold;color:${TEXT};">${esc(m.name)}${m.pronouns ? ` <span style="font-weight:normal;color:${MUTED};">(${esc(m.pronouns)})</span>` : ''}</div>` : ''}
          ${role ? `<div style="font-size:${m.fs}px;line-height:1.5;color:${MUTED};">${role}</div>` : ''}
          <div style="font-size:${m.fs}px;line-height:1.8;color:${MUTED};margin-top:4px;">
            ${[...contacts, ...socials].join(`<span style="color:#BDB6AB;"> &nbsp;|&nbsp; </span>`)}
          </div>
          ${m.cta ? `<div style="font-size:${m.fs}px;line-height:1.6;margin-top:6px;">${link(m, m.cta.href, m.cta.text + ' →', m.accent)}</div>` : ''}
        </td></tr>`) + extras(m);
      },
    },

    stacked: {
      name: 'Stacked',
      thumb: [['i', 10, 8, 18, 18, '50%'], ['i', 10, 30, 40, 5], ['a', 10, 38, 26, 3], ['i', 60, 30, 34, 3], ['i', 60, 37, 30, 3]],
      build(m) {
        return signoff(m) + wrap(m, `
          ${m.photo ? `<tr><td style="padding:0 0 12px;">${photoImg(m)}</td></tr>` : ''}
          <tr><td>
            ${nameLine(m, m.fs + 5)}
            ${roleLine(m, { joiner: ' at ' })}
          </td></tr>
          <tr><td style="padding:12px 0 0;">
            <table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse;">
              ${m.contacts.map(c => `<tr>
                ${m.iconSet
                  ? `<td style="padding:2px 10px 2px 0;line-height:0;" valign="middle">${iconImg(m, c.icon)}</td>`
                  : m.iconStyle === 'text'
                    ? `<td style="padding:0 12px 2px 0;font-size:${m.fs - 1}px;line-height:1.6;color:${m.accent};font-weight:bold;letter-spacing:1px;text-transform:uppercase;" valign="top">${c.word}</td>`
                    : ''}
                <td style="padding:2px 0;font-size:${m.fs}px;line-height:1.6;" valign="middle">${contactValue(m, c)}</td>
              </tr>`).join('')}
            </table>
            ${socialLine(m)}
            ${ctaButton(m)}
          </td></tr>`) + extras(m);
      },
    },

    banner: {
      name: 'Banner',
      thumb: [['a', 8, 8, 96, 22, '4px'], ['i', 12, 36, 30, 3], ['i', 46, 36, 30, 3], ['i', 12, 42, 22, 3]],
      build(m) {
        const photo = m.photo ? `<td valign="middle" style="padding:0 14px 0 0;">${photoImg(m, Math.min(m.photoSize, 64))}</td>` : '';
        const role = [m.title, m.company].filter(Boolean).map(esc).join(' · ');
        return signoff(m) + wrap(m, `
          <tr><td style="background:${m.accent};border-radius:8px;padding:14px 18px;">
            <table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse;"><tr>
              ${photo}
              <td valign="middle">
                ${m.name ? `<div style="font-size:${m.fs + 5}px;line-height:1.25;font-weight:bold;color:#FFFFFF;">${esc(m.name)}${m.pronouns ? ` <span style="font-weight:normal;font-size:${m.fs - 1}px;opacity:.8;">(${esc(m.pronouns)})</span>` : ''}</div>` : ''}
                ${role ? `<div style="font-size:${m.fs}px;line-height:1.5;color:#FFFFFF;opacity:.85;margin-top:2px;">${role}</div>` : ''}
              </td>
            </tr></table>
          </td></tr>
          <tr><td style="padding:10px 4px 0;">
            ${contactInline(m)}
            ${socialLine(m)}
            ${ctaButton(m)}
          </td></tr>`) + extras(m);
      },
    },
  };

  // ---------- State ----------
  let state = { ...SAMPLE };
  let remember = false;

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        state = { ...EMPTY, ...JSON.parse(raw) };
        remember = true;
      }
    } catch { /* storage unavailable — run without it */ }
  }

  function persist() {
    try {
      if (remember) localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      else localStorage.removeItem(STORAGE_KEY);
    } catch { /* ignore */ }
  }

  // ---------- Rendering ----------
  const $ = sel => document.querySelector(sel);
  const preview = $('#preview');
  const status = $('#status');

  // forExport: icons point at hosted PNGs instead of inline SVG previews.
  function signatureHtml(forExport = false) {
    const m = model(state, forExport);
    const tpl = TEMPLATES[state.template] || TEMPLATES.classic;
    return tpl.build(m).replace(/\n\s+/g, '\n').trim();
  }

  function hasContent() {
    return ['name', 'title', 'company', 'email', 'phone', 'website'].some(k => String(state[k] || '').trim());
  }

  function render() {
    preview.innerHTML = hasContent()
      ? signatureHtml()
      : '<p class="sig-empty">Start typing on the left — your signature will appear here.</p>';
    syncPhotoUI();
    persist();
  }

  // ---------- Photo upload ----------
  // The image is squared and shrunk to 240px (2× the largest display size) in the
  // browser, then hosted via /api/upload so every email client can load it.
  // If hosting isn't available it's embedded as a data URI instead.
  const IMG_PX = 240;
  const uploadEl = $('#upload');
  const uploadStatus = $('#uploadStatus');
  const DEFAULT_UPLOAD_MSG = uploadStatus.textContent;
  const EMBED_MSG = 'Couldn’t host the image, so it’s embedded in the signature. That works in Apple Mail and Outlook desktop, but Gmail removes embedded images — for Gmail, paste a hosted image link below.';
  let lastFile = null;
  let uploadSeq = 0;

  function setUploadStatus(msg, tone = '') {
    uploadStatus.textContent = msg;
    uploadStatus.className = 'upload-status' + (tone ? ` is-${tone}` : '');
  }

  function syncPhotoUI() {
    const src = toUrl(state.photo) || (isImageData(state.photoData) ? state.photoData : '');
    const thumb = $('#uploadThumb');
    thumb.style.backgroundImage = src ? `url("${src.replace(/"/g, '%22')}")` : '';
    thumb.style.backgroundSize = state.photoFit === 'contain' ? 'contain' : 'cover';
    thumb.style.borderRadius = state.photoShape === 'circle' ? '50%' : state.photoShape === 'rounded' ? '12px' : '4px';
    $('#photoRemove').hidden = !src;
    $('#uploadLabel').textContent = src ? 'Replace image' : 'Upload image';
  }

  async function prepareImage(file, fit) {
    const objUrl = URL.createObjectURL(file);
    const img = new Image();
    img.src = objUrl;
    try { await img.decode(); } finally { URL.revokeObjectURL(objUrl); }

    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = IMG_PX;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    const { naturalWidth: sw, naturalHeight: sh } = img;
    // Logos keep transparency as PNG; photos become compact JPEGs on white.
    const type = fit === 'contain' && file.type !== 'image/jpeg' ? 'image/png' : 'image/jpeg';
    if (type === 'image/jpeg') { ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, IMG_PX, IMG_PX); }

    if (fit === 'contain') {
      const s = Math.min(IMG_PX / sw, IMG_PX / sh);
      ctx.drawImage(img, (IMG_PX - sw * s) / 2, (IMG_PX - sh * s) / 2, sw * s, sh * s);
    } else {
      const side = Math.min(sw, sh);
      ctx.drawImage(img, (sw - side) / 2, (sh - side) / 2, side, side, 0, 0, IMG_PX, IMG_PX);
    }
    const blob = await new Promise(r => canvas.toBlob(r, type, 0.88));
    return { blob, dataUrl: canvas.toDataURL(type, 0.88) };
  }

  async function hostImage(blob) {
    if (!/^https?:$/.test(location.protocol)) throw new Error('Not served over http');
    const res = await fetch('/api/upload', { method: 'POST', headers: { 'content-type': blob.type }, body: blob });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.url) throw new Error(data.error || `Upload failed (${res.status})`);
    return data.url;
  }

  async function handleFile(file) {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) return setUploadStatus('Please choose a PNG, JPG or WebP image.', 'warn');
    if (file.size > 15 * 1024 * 1024) return setUploadStatus('That image is over 15 MB — please pick a smaller one.', 'warn');

    lastFile = file;
    const seq = ++uploadSeq;
    const label = $('#uploadLabel').parentElement;
    label.classList.add('is-busy');
    setUploadStatus('Preparing image…');

    try {
      const { blob, dataUrl } = await prepareImage(file, state.photoFit);
      if (seq !== uploadSeq) return;
      // Show it immediately while the upload runs.
      state.photoData = dataUrl;
      state.photo = '';
      syncFields();
      render();

      setUploadStatus('Uploading…');
      try {
        const url = await hostImage(blob);
        if (seq !== uploadSeq) return;
        state.photo = url;
        state.photoData = '';
        setUploadStatus('Image hosted — it will show in Gmail, Outlook and Apple Mail.', 'ok');
      } catch (err) {
        if (seq !== uploadSeq) return;
        console.warn('Image hosting unavailable:', err.message);
        setUploadStatus(EMBED_MSG, 'warn');
      }
      syncFields();
      render();
    } catch {
      if (seq === uploadSeq) setUploadStatus('Couldn’t read that image. Try a PNG or JPG.', 'warn');
    } finally {
      if (seq === uploadSeq) label.classList.remove('is-busy');
    }
  }

  function clearPhoto(msg = DEFAULT_UPLOAD_MSG) {
    uploadSeq++;
    lastFile = null;
    state.photo = '';
    state.photoData = '';
    $('#uploadLabel').parentElement.classList.remove('is-busy');
    setUploadStatus(msg);
  }

  $('#photoFile').addEventListener('change', e => {
    handleFile(e.target.files[0]);
    e.target.value = '';
  });
  $('#photoRemove').addEventListener('click', () => { clearPhoto(); syncFields(); render(); });

  ['dragenter', 'dragover'].forEach(t => uploadEl.addEventListener(t, e => {
    e.preventDefault();
    uploadEl.classList.add('is-drag');
  }));
  ['dragleave', 'drop'].forEach(t => uploadEl.addEventListener(t, () => uploadEl.classList.remove('is-drag')));
  uploadEl.addEventListener('drop', e => {
    e.preventDefault();
    handleFile(e.dataTransfer.files[0]);
  });

  function buildTemplatePicker() {
    const host = $('#templates');
    host.innerHTML = Object.entries(TEMPLATES).map(([id, t]) => `
      <button type="button" class="tpl" role="radio" data-tpl="${id}" aria-checked="false">
        <span class="tpl-thumb">${t.thumb.map(([c, x, y, w, h, r]) =>
          `<i class="${c}" style="left:${(x / 1.12).toFixed(1)}%;top:${y}px;width:${r === '50%' ? `${w}px` : `${(w / 1.12).toFixed(1)}%`};height:${h}px;${r ? `border-radius:${r};` : ''}"></i>`).join('')}</span>
        <span class="tpl-name">${t.name}</span>
      </button>`).join('');
    // Compact chips above the preview, so templates can be switched on mobile
    // without leaving the preview tab.
    $('#tplChips').innerHTML = Object.entries(TEMPLATES).map(([id, t]) =>
      `<button type="button" class="tpl-chip" role="radio" data-tpl="${id}" aria-checked="false">${t.name}</button>`).join('');

    const pick = e => {
      const btn = e.target.closest('[data-tpl]');
      if (!btn) return;
      state.template = btn.dataset.tpl;
      syncTemplate();
      render();
    };
    host.addEventListener('click', pick);
    $('#tplChips').addEventListener('click', pick);
  }

  function syncTemplate() {
    document.querySelectorAll('[data-tpl]').forEach(b =>
      b.setAttribute('aria-checked', String(b.dataset.tpl === state.template)));
    $('#templates').style.setProperty('--thumb-accent', state.accent);
  }

  function buildIconStyles() {
    const host = $('#iconStyles');
    host.innerHTML = ICON_STYLES.map(s =>
      `<button type="button" class="icon-style" role="radio" data-icons="${s.id}" aria-checked="false">
        <span class="icon-sample" aria-hidden="true"></span>
        <span class="icon-name">${s.name}</span>
      </button>`).join('');
    host.addEventListener('click', e => {
      const btn = e.target.closest('.icon-style');
      if (!btn) return;
      state.iconStyle = btn.dataset.icons;
      syncIconStyles();
      render();
    });
  }

  function syncIconStyles() {
    const accent = isHex(state.accent) ? state.accent : '#2C2C2C';
    document.querySelectorAll('.icon-style').forEach(btn => {
      const id = btn.dataset.icons;
      btn.setAttribute('aria-checked', String(id === state.iconStyle));
      btn.querySelector('.icon-sample').innerHTML = ICON_SETS.includes(id)
        ? ['phone', 'email', 'website'].map(n =>
          `<img src="${iconSrc(id, n, accent, false)}" width="16" height="16" alt="" />`).join('')
        : id === 'text'
          ? `<b style="color:${accent}">P</b><b style="color:${accent}">E</b><b style="color:${accent}">W</b>`
          : '<i>—</i>';
    });
  }

  function buildSwatches() {
    const host = $('#swatches');
    host.innerHTML = ACCENTS.map(c =>
      `<button type="button" class="swatch" role="radio" aria-label="Accent ${c}" data-color="${c}" style="background:${c}"></button>`
    ).join('') + `<label class="swatch-custom" title="Custom colour"><input type="color" aria-label="Custom accent colour" /></label>`;

    host.addEventListener('click', e => {
      const sw = e.target.closest('.swatch');
      if (!sw) return;
      state.accent = sw.dataset.color;
      syncSwatches();
      render();
    });
    host.querySelector('input[type="color"]').addEventListener('input', e => {
      state.accent = e.target.value.toUpperCase();
      syncSwatches();
      render();
    });
  }

  function syncSwatches() {
    const preset = ACCENTS.includes(state.accent.toUpperCase());
    document.querySelectorAll('.swatch').forEach(s =>
      s.setAttribute('aria-checked', String(s.dataset.color === state.accent.toUpperCase())));
    const custom = document.querySelector('.swatch-custom');
    custom.classList.toggle('is-active', !preset);
    custom.style.background = preset ? '' : state.accent;
    custom.querySelector('input').value = isHex(state.accent) ? state.accent.toLowerCase() : '#2c2c2c';
    $('#templates').style.setProperty('--thumb-accent', state.accent);
    syncIconStyles();
  }

  function syncFields() {
    document.querySelectorAll('[data-key]').forEach(el => { el.value = state[el.dataset.key] ?? ''; });
    syncTemplate();
    syncSwatches();
  }

  function bindFields() {
    document.querySelectorAll('[data-key]').forEach(el => {
      el.addEventListener('input', () => {
        const key = el.dataset.key;
        state[key] = el.value;
        // A pasted link replaces any uploaded image.
        if (key === 'photo') { uploadSeq++; lastFile = null; state.photoData = ''; setUploadStatus(DEFAULT_UPLOAD_MSG); }
        render();
        // Re-crop the uploaded file when the fit mode changes.
        if (key === 'photoFit' && lastFile) handleFile(lastFile);
      });
    });
  }

  // ---------- Export ----------
  function flash(msg) {
    status.textContent = msg;
    clearTimeout(flash.t);
    flash.t = setTimeout(() => { status.textContent = ''; }, 3500);
  }

  async function copyRich() {
    if (!hasContent()) return flash('Add some details first.');
    const html = signatureHtml(true);
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    try {
      if (window.ClipboardItem && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([tmp.innerText], { type: 'text/plain' }),
        })]);
      } else {
        // Older browsers: select an off-screen copy of the export markup.
        tmp.style.cssText = 'position:fixed;left:-9999px;top:0;';
        document.body.appendChild(tmp);
        const range = document.createRange();
        range.selectNodeContents(tmp);
        const sel = getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        document.execCommand('copy');
        sel.removeAllRanges();
        tmp.remove();
      }
      flash('Signature copied — paste it into your email client’s signature settings.');
    } catch {
      flash('Couldn’t access the clipboard. Try selecting the preview and copying manually.');
    }
  }

  async function copyHtml() {
    if (!hasContent()) return flash('Add some details first.');
    try {
      await navigator.clipboard.writeText(signatureHtml(true));
      flash('HTML source copied.');
    } catch {
      flash('Couldn’t access the clipboard in this browser.');
    }
  }

  function download() {
    if (!hasContent()) return flash('Add some details first.');
    const doc = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Email signature${state.name ? ' — ' + esc(state.name) : ''}</title>
</head>
<body style="margin:0;padding:24px;background:#FFFFFF;">
<!-- Signature start -->
${signatureHtml(true)}
<!-- Signature end -->
</body>
</html>`;
    const url = URL.createObjectURL(new Blob([doc], { type: 'text/html' }));
    const a = document.createElement('a');
    const slug = (state.name || 'signature').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'signature';
    a.href = url;
    a.download = `${slug}-email-signature.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    flash('Downloaded.');
  }

  // ---------- Init ----------
  load();
  buildTemplatePicker();
  buildIconStyles();
  buildSwatches();
  syncFields();
  bindFields();
  render();

  const rememberEl = $('#remember');
  rememberEl.checked = remember;
  rememberEl.addEventListener('change', () => {
    remember = rememberEl.checked;
    persist();
    flash(remember ? 'Saved on this device only.' : 'Removed from this device.');
  });

  if (!toUrl(state.photo) && isImageData(state.photoData)) setUploadStatus(EMBED_MSG, 'warn');

  $('#reset').addEventListener('click', () => {
    clearPhoto();
    state = { ...EMPTY };
    syncFields();
    render();
    flash('Cleared.');
  });

  document.querySelectorAll('.seg-btn').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('.seg-btn').forEach(b => b.classList.toggle('is-active', b === btn));
    $('#mail').classList.toggle('is-mobile', btn.dataset.view === 'mobile');
  }));

  // Mobile: switch between the form and the preview.
  document.querySelectorAll('.mtab').forEach(btn => btn.addEventListener('click', () => {
    document.body.dataset.mview = btn.dataset.mview;
    document.querySelectorAll('.mtab').forEach(b => {
      b.classList.toggle('is-active', b === btn);
      b.setAttribute('aria-pressed', String(b === btn));
    });
    window.scrollTo({ top: 0 });
  }));

  $('#copyRich').addEventListener('click', copyRich);
  $('#copyHtml').addEventListener('click', copyHtml);
  $('#download').addEventListener('click', download);
})();
