(() => {
  'use strict';

  const STORAGE_KEY = 'sigmaker:v1';

  const ACCENTS = ['#2C2C2C', '#4A6B5D', '#3E5C76', '#A0633F', '#8C4A5B', '#6B5B95', '#B08D3C'];

  const SAMPLE = {
    name: 'Astrid Lindqvist',
    title: 'Product Designer',
    company: 'Nordvik Studio',
    email: 'astrid@nordvik.studio',
    phone: '+46 70 123 45 67',
    website: 'nordvik.studio',
    address: 'Stockholm, Sweden',
    linkedin: 'linkedin.com/in/astrid',
    github: '',
    twitter: '',
    portfolio: '',
    instagram: '',
    whatsapp: '',
    facebook: '',
    youtube: '',
    tiktok: '',
    behance: '',
    dribbble: '',
    photo: '',
    photoData: '',   // processed photo embedded in the signature (data URI)
    photoOrig: '',   // downscaled original, for re-applying shape/fit
    photoHost: false, // opt-in: also upload to Vercel Blob and link to it
    photoHosted: '',  // hosted copy's URL (when photoHost is on)
    photoFrom: '',    // pasted link that photoOrig/photoData were made from
    photoFit: 'cover',
    siteCard: false,       // show a link-preview card for the website
    siteCardTitle: '',
    siteCardImage: '',     // cropped preview image, embedded (data URI)
    siteCardFor: '',       // website URL the card was fetched for
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
    photoAnim: 'none',    // 'none' | 'glow' | 'orbit' | 'story' | 'shimmer' — animated photo (GIF)
    ctaPulse: false,      // call-to-action button gently pulses (GIF)
    dir: 'auto',
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
    photoShape: 'circle', photoFit: 'cover', photoHost: false, siteCard: false, photoSize: '72', font: SAMPLE.font, fontSize: '13',
    accent: '#2C2C2C', iconStyle: 'line', photoAnim: 'none', ctaPulse: false, dir: 'auto', template: 'classic',
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
      // Require a real-looking host ("example.com"), not just a word.
      return (u.protocol === 'http:' || u.protocol === 'https:') && /\.[a-z]{2,}$/i.test(u.hostname) ? u.href : '';
    } catch { return ''; }
  }

  // Profile links. `base` lets a field take a bare username ("astrid" or
  // "@astrid"); the first four are shown by default, the rest behind "More profiles".
  const PROFILES = [
    { key: 'linkedin', label: 'LinkedIn', icon: 'linkedin', base: 'linkedin.com/in/', primary: true },
    { key: 'instagram', label: 'Instagram', icon: 'instagram', base: 'instagram.com/', primary: true },
    { key: 'whatsapp', label: 'WhatsApp', icon: 'whatsapp', primary: true, type: 'tel', placeholder: '+972 50 123 4567' },
    { key: 'portfolio', label: 'Portfolio / Other', short: 'Portfolio', icon: 'link', primary: true, placeholder: 'Any link, e.g. behance.net/you' },
    { key: 'twitter', label: 'X / Twitter', short: 'X', icon: 'x', base: 'x.com/' },
    { key: 'facebook', label: 'Facebook', icon: 'facebook', base: 'facebook.com/' },
    { key: 'youtube', label: 'YouTube', icon: 'youtube', base: 'youtube.com/@', placeholder: 'Channel link or @handle' },
    { key: 'tiktok', label: 'TikTok', icon: 'tiktok', base: 'tiktok.com/@', placeholder: 'Profile link or @handle' },
    { key: 'github', label: 'GitHub', icon: 'github', base: 'github.com/' },
    { key: 'behance', label: 'Behance', icon: 'behance', base: 'behance.net/' },
    { key: 'dribbble', label: 'Dribbble', icon: 'dribbble', base: 'dribbble.com/' },
  ];
  const PROFILE = Object.fromEntries(PROFILES.map(p => [p.key, p]));

  // Build the profile inputs now, before fields are bound and synced.
  (function buildProfileFields() {
    const field = p => `<label class="field">
        <span>${p.label}</span>
        <input type="${p.type || 'url'}" data-key="${p.key}" placeholder="${p.placeholder || (p.base ? 'Profile link or username' : '')}" />
      </label>`;
    document.getElementById('profileFields').innerHTML = PROFILES.filter(p => p.primary).map(field).join('');
    document.getElementById('moreProfileFields').innerHTML = PROFILES.filter(p => !p.primary).map(field).join('');
  })();

  // WhatsApp: a phone number in international format becomes a wa.me chat link.
  function whatsappUrl(raw) {
    const v = String(raw || '').trim();
    if (/^(https?:\/\/)?(wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com)\//i.test(v)) return toUrl(v);
    const digits = v.replace(/[\s().\-\/]/g, '');
    return /^\+?[1-9]\d{7,14}$/.test(digits) ? `https://wa.me/${digits.replace('+', '')}` : '';
  }

  function profileUrl(key, raw) {
    const v = String(raw || '').trim();
    if (key === 'whatsapp') return whatsappUrl(v);
    const handle = v.replace(/^@/, '');
    const base = PROFILE[key] && PROFILE[key].base;
    // A bare word is a username ("oved.elisha" included), unless it looks like
    // a web address ("instagram.com", "me.co.il").
    const looksLikeDomain = /\.(com|net|org|io|co|il|app|dev|me|ly|gl|be|tv|info|biz|xyz|site|online|studio|design)$/i.test(handle);
    if (base && /^[a-z0-9][a-z0-9._-]{0,99}$/i.test(handle) && !looksLikeDomain) {
      return toUrl(base + handle);
    }
    return toUrl(v);
  }

  // Pasted photo links: turn share-page links into direct image links where
  // possible, and recognise links that won't work in email.
  function photoLink(raw) {
    const href = toUrl(raw);
    if (!href) return { url: '' };
    const u = new URL(href);
    const host = u.hostname.replace(/^www\./, '');

    if (host === 'drive.google.com' || host === 'docs.google.com') {
      const id = (u.pathname.match(/\/file\/d\/([\w-]{10,})/) || [])[1] || u.searchParams.get('id');
      if (id && /^[\w-]{10,}$/.test(id)) {
        return { url: `https://lh3.googleusercontent.com/d/${id}`, note: 'Google Drive link converted to a direct image link. Make sure the file is shared as “Anyone with the link”.' };
      }
      return { url: '', problem: 'This Google Drive link doesn’t point to a single file. Open the image in Drive, choose Share → Copy link, and paste that.' };
    }
    if (host === 'dropbox.com' || host === 'dl.dropboxusercontent.com') {
      u.searchParams.delete('dl');
      u.searchParams.set('raw', '1');
      return { url: u.href, note: 'Dropbox link converted to a direct image link.' };
    }
    if (host === 'photos.app.goo.gl' || host === 'photos.google.com') {
      return { url: '', problem: 'Google Photos links open a web page, not the image. Download the photo and use Upload image instead.' };
    }
    if (host.endsWith('licdn.com')) {
      return { url: href, problem: 'LinkedIn photo links expire after a few weeks, so the photo would disappear from your signature. Use Upload image instead.' };
    }
    return { url: href };
  }

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
  const PHONE_RE = /^\+?[\d\s().\-\/]+$/;
  const prettyUrl = href => href.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
  const telHref = p => 'tel:' + p.replace(/[^\d+]/g, '');
  const mailHref = e => 'mailto:' + encodeURIComponent(e.trim()).replace(/%40/g, '@');
  const isHex = c => /^#[0-9a-f]{6}$/i.test(c);
  // Rounded-corner radius as a fraction of the photo's side. Uploads bake the
  // same ratio into the image, so baked and CSS corners line up.
  const ROUNDED_RATIO = 1 / 6;
  const isImageData = d => /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(String(d || ''));

  // ---------- Text direction ----------
  // Hebrew, Arabic, Syriac, Thaana, N'Ko… plus presentation forms.
  const RTL_CHAR = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
  const LTR_CHAR = /[A-Za-zÀ-ɏͰ-ԯ]/;

  function firstStrongDir(text) {
    for (const ch of text) {
      if (RTL_CHAR.test(ch)) return 'rtl';
      if (LTR_CHAR.test(ch)) return 'ltr';
    }
    return '';
  }

  // 'auto' goes with whichever script most of the details are written in
  // (name, title, company, location), so an English name with a Hebrew title
  // and company still gets a right-to-left layout. Ties follow the name.
  function resolveDir(s) {
    if (s.dir === 'rtl' || s.dir === 'ltr') return s.dir;
    const text = [s.name, s.title, s.company, s.address].join(' ');
    let rtl = 0, ltr = 0;
    for (const ch of text) {
      if (RTL_CHAR.test(ch)) rtl++;
      else if (LTR_CHAR.test(ch)) ltr++;
    }
    if (rtl !== ltr) return rtl > ltr ? 'rtl' : 'ltr';
    return firstStrongDir(text) || 'ltr';
  }

  // Contact labels for the Stacked template, matched to the script in use.
  const LABEL_WORDS = {
    en: { phone: 'Phone', email: 'Email', website: 'Web', location: 'Based in' },
    he: { phone: 'טלפון', email: 'אימייל', website: 'אתר', location: 'מיקום' },
    ar: { phone: 'هاتف', email: 'بريد', website: 'موقع', location: 'العنوان' },
  };
  function labelLang(s, dir) {
    if (dir !== 'rtl') return 'en';
    const text = [s.name, s.title, s.company, s.address].join(' ');
    if (/[֐-׿]/.test(text)) return 'he';
    if (/[؀-ۿ]/.test(text)) return 'ar';
    return 'en';
  }

  // Which photo the signature uses: the hosted copy (opt-in), else the processed
  // embedded image, else — while a pasted link is still being processed, or if
  // it can't be — the link itself.
  function photoSrc(s) {
    if (s.photoHost && toUrl(s.photoHosted)) return toUrl(s.photoHosted);
    const link = String(s.photo || '').trim();
    if (isImageData(s.photoData) && (!link || s.photoFrom === link)) return s.photoData;
    return photoLink(link).url;
  }

  const PHOTO_ANIMS = ['glow', 'orbit', 'story', 'shimmer'];

  // ---------- Data shaping ----------
  function iconSrc(set, name, color, forExport) {
    if (forExport && ICON_HOST) return `${ICON_HOST}/i/${set}/${color.slice(1).toLowerCase()}/${name}.png`;
    return 'data:image/svg+xml,' + encodeURIComponent(iconSvg(set, name, color));
  }

  function model(s, forExport = false) {
    const accent = isHex(s.accent) ? s.accent : '#2C2C2C';
    const fs = Number(s.fontSize) || 13;
    const photoSize = Math.min(120, Math.max(48, Number(s.photoSize) || 72));
    const radius = s.photoShape === 'circle' ? '50%'
      : s.photoShape === 'rounded' ? `${Math.round(photoSize * ROUNDED_RATIO)}px` : '0';
    const iconStyle = ICON_STYLES.some(x => x.id === s.iconStyle) ? s.iconStyle : 'line';
    const iconSet = ICON_SETS.includes(iconStyle) ? iconStyle : '';
    const dir = resolveDir(s);
    const words = LABEL_WORDS[labelLang(s, dir)];

    // Phone numbers, emails and URLs are always laid out left-to-right, even
    // inside right-to-left text, so they never get scrambled.
    const contacts = [];
    if (s.phone.trim()) contacts.push({ label: 'P', icon: 'phone', dir: 'ltr', text: s.phone.trim(), href: PHONE_RE.test(s.phone.trim()) ? telHref(s.phone) : '' });
    if (EMAIL_RE.test(s.email.trim())) contacts.push({ label: 'E', icon: 'email', dir: 'ltr', text: s.email.trim(), href: mailHref(s.email) });
    const site = toUrl(s.website);
    if (site) contacts.push({ label: 'W', icon: 'website', dir: 'ltr', text: prettyUrl(site), href: site });
    if (s.address.trim()) contacts.push({ label: 'A', icon: 'location', dir: 'auto', text: s.address.trim(), href: '' });
    contacts.forEach(c => { c.word = words[c.icon]; });

    const socials = PROFILES
      .map(p => ({ label: p.short || p.label, icon: p.icon, href: profileUrl(p.key, s[p.key]) }))
      .filter(x => x.href);

    return {
      iconStyle, iconSet,
      icon: name => iconSrc(iconSet, name, accent, forExport),
      dir, rtl: dir === 'rtl',
      photoAnim: PHOTO_ANIMS.includes(s.photoAnim) ? s.photoAnim : 'none',
      ctaPulse: !!s.ctaPulse,
      photoShape: ['circle', 'rounded', 'square'].includes(s.photoShape) ? s.photoShape : 'circle',
      name: s.name.trim(),
      title: s.title.trim(),
      company: s.company.trim(),
      // A hosted link wins; an embedded image is the fallback when hosting isn't available.
      photo: photoSrc(s),
      photoFit: s.photoFit === 'contain' ? 'contain' : 'cover',
      photoSize, radius,
      // Only fonts offered in the picker (values are trusted, never user-typed)
      font: FONTS.includes(s.font) ? s.font : SAMPLE.font,
      fs, accent,
      contacts, socials,
      signoff: s.signoff.trim(),
      cta: s.ctaText.trim() && toUrl(s.ctaUrl) ? { text: s.ctaText.trim(), href: toUrl(s.ctaUrl) } : null,
      disclaimer: s.disclaimer.trim(),
      // Only show a card that was fetched for the current website.
      siteCard: s.siteCard && site && s.siteCardFor === site ? {
        href: site,
        host: new URL(site).hostname.replace(/^www\./, ''),
        title: String(s.siteCardTitle || '').trim(),
        image: isImageData(s.siteCardImage) ? s.siteCardImage : '',
      } : null,
    };
  }

  // ---------- Signature building blocks (email-safe, inline styles) ----------
  const TEXT = '#2C2C2C';
  const MUTED = '#6F6A63';

  // Bidi: every piece of user text is isolated in its own span, so Hebrew or
  // Arabic mixed with English (and punctuation between them) renders in the
  // right order whatever the layout direction. `dir` on inline elements
  // isolates the run; 'ltr' pins phone numbers, emails and URLs.
  const txt = (s, dir = 'auto') => `<span dir="${dir}">${esc(s)}</span>`;

  const link = (m, href, text, color = TEXT, dir = 'auto') =>
    `<a href="${esc(href)}" dir="${dir}" style="color:${color};text-decoration:none;">${esc(text)}</a>`;

  // Gap between table columns. Mail apps (Gmail especially) strip `dir` from
  // tables and decide column order from their own editor direction, so gaps are
  // separate empty columns rather than one-sided padding: the layout then looks
  // right whichever way the columns end up running.
  const spacer = w =>
    `<td width="${w}" style="width:${w}px;min-width:${w}px;font-size:0;line-height:0;">&nbsp;</td>`;
  const arrow = m => (m.rtl ? '&larr;' : '&rarr;');

  function nameLine(m, size, { color = TEXT } = {}) {
    if (!m.name) return '';
    return `<div style="font-size:${size}px;line-height:1.25;font-weight:bold;color:${color};margin:0;">${txt(m.name)}</div>`;
  }

  // "Title, Company" — each part isolated so a Hebrew title and English company keep their order.
  function roleLine(m, { joiner = ', ' } = {}) {
    if (!m.title && !m.company) return '';
    const t = m.title ? `<span style="color:${m.accent};">${txt(m.title)}</span>` : '';
    const c = m.company ? `<span style="color:${MUTED};">${txt(m.company)}</span>` : '';
    return `<div style="font-size:${m.fs}px;line-height:1.5;margin:2px 0 0;">${[t, c].filter(Boolean).join(`<span style="color:${MUTED};">${joiner}</span>`)}</div>`;
  }

  const roleText = (m, sep) => [m.title, m.company].filter(Boolean).map(v => txt(v)).join(sep);

  const TABLE = 'cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse;"';
  const tableWith = style => TABLE.replace('style="', `style="${style}`);

  // Contact icons scale with the text; badges carry their own padding so run a bit larger.
  const iconSize = m => m.fs + (m.iconSet === 'badge' ? 5 : 2);

  function iconImg(m, name, size = iconSize(m), alt = '') {
    return `<img src="${esc(m.icon(name))}" width="${size}" height="${size}" alt="${esc(alt)}" style="display:inline-block;width:${size}px;height:${size}px;border:0;vertical-align:middle;" />`;
  }

  function contactValue(m, c, color = TEXT) {
    return c.href ? link(m, c.href, c.text, color, c.dir) : `<span style="color:${color};">${txt(c.text, c.dir)}</span>`;
  }

  // One contact per line: [icon | letter] value
  function contactRows(m) {
    if (!m.contacts.length) return '';
    if (m.iconSet) {
      return `<table ${TABLE}>${m.contacts.map(c => `<tr>
        <td valign="middle" style="padding:2px 0;line-height:0;">${iconImg(m, c.icon)}</td>${spacer(8)}
        <td valign="middle" style="padding:2px 0;font-size:${m.fs}px;line-height:1.5;">${contactValue(m, c)}</td>
      </tr>`).join('')}</table>`;
    }
    return m.contacts.map(c => {
      const lab = m.iconStyle === 'text' ? `<span style="color:${m.accent};font-weight:bold;">${c.label}</span>&nbsp;&nbsp;` : '';
      return `<div style="font-size:${m.fs}px;line-height:1.6;">${lab}${contactValue(m, c)}</div>`;
    }).join('');
  }

  // All contacts on one wrapping line
  function contactInline(m, sep = ' &nbsp;·&nbsp; ') {
    if (!m.contacts.length) return '';
    const items = m.contacts.map(c => {
      const val = contactValue(m, c);
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
      `<td style="line-height:0;"><a href="${esc(s.href)}" style="text-decoration:none;">${iconImg(m, s.icon, size, s.label)}</a></td>`
    ).join(spacer(8));
    return `<table ${tableWith('margin-top:10px;')}><tr>${cells}</tr></table>`;
  }

  function socialLine(m, { pill = false } = {}) {
    if (!m.socials.length) return '';
    if (m.iconSet) return socialIcons(m);
    if (pill) {
      const cells = m.socials.map(s =>
        `<td><a href="${esc(s.href)}" style="display:inline-block;padding:3px 10px;border:1px solid ${m.accent};border-radius:12px;color:${m.accent};font-size:${m.fs - 1}px;text-decoration:none;">${esc(s.label)}</a></td>`
      ).join(spacer(6));
      return `<table ${tableWith('margin-top:10px;')}><tr>${cells}</tr></table>`;
    }
    const items = m.socials.map(s => link(m, s.href, s.label, m.accent));
    return `<div style="font-size:${m.fs}px;line-height:1.6;margin-top:8px;font-weight:bold;">${items.join(`<span style="color:${MUTED};font-weight:normal;"> &nbsp;·&nbsp; </span>`)}</div>`;
  }

  function photoImg(m, size = m.photoSize) {
    if (!m.photo) return '';
    // Animated photo (GIF): needs the embedded image, since canvas can't read
    // pixels from other sites. Until it's ready the still photo is used.
    if (m.photoAnim !== 'none' && m.photo.startsWith('data:image/')) {
      const gif = requestAnim({
        kind: 'photo', effect: m.photoAnim, size, shape: m.photoShape,
        color: m.accent, radiusRatio: ROUNDED_RATIO, src: m.photo,
      });
      if (gif) {
        return `<img src="${gif.dataUrl}" width="${size}" height="${size}" alt="${esc(m.name || 'Photo')}" style="display:block;width:${size}px;height:${size}px;border:0;" />`;
      }
    }
    return `<img src="${esc(m.photo)}" width="${size}" height="${size}" alt="${esc(m.name || 'Photo')}" style="display:block;width:${size}px;height:${size}px;border-radius:${m.radius};object-fit:${m.photoFit};border:0;" />`;
  }

  function ctaButton(m) {
    if (!m.cta) return '';
    if (m.ctaPulse) {
      const gif = requestAnim({
        kind: 'button', text: m.cta.text, family: m.font, sizePx: m.fs, color: m.accent, rtl: m.rtl,
      });
      if (gif) {
        return `<table ${tableWith('margin-top:12px;')}><tr><td style="line-height:0;"><a href="${esc(m.cta.href)}" style="text-decoration:none;"><img src="${gif.dataUrl}" width="${gif.width}" height="${gif.height}" alt="${esc(m.cta.text)}" style="display:block;width:${gif.width}px;height:${gif.height}px;border:0;" /></a></td></tr></table>`;
      }
    }
    return `<table ${tableWith('margin-top:12px;')}><tr><td style="background:${m.accent};border-radius:6px;"><a href="${esc(m.cta.href)}" style="display:inline-block;padding:8px 16px;color:#FFFFFF;font-size:${m.fs}px;font-weight:bold;text-decoration:none;">${txt(m.cta.text)} ${arrow(m)}</a></td></tr></table>`;
  }

  // Link-preview card for the website: image on top, title and domain below,
  // the whole card clickable.
  const CARD_W = 300;
  const CARD_H = Math.round(CARD_W / 1.91); // standard og:image ratio

  function siteCard(m) {
    const c = m.siteCard;
    if (!c) return '';
    const img = c.image
      ? `<tr><td style="padding:0;line-height:0;"><a href="${esc(c.href)}" style="text-decoration:none;"><img src="${esc(c.image)}" width="${CARD_W}" height="${CARD_H}" alt="${esc(c.title || c.host)}" style="display:block;width:${CARD_W}px;height:${CARD_H}px;border:0;border-radius:8px 8px 0 0;" /></a></td></tr>`
      : '';
    return `<table ${tableWith(`margin-top:14px;width:${CARD_W}px;border-collapse:separate;border:1px solid #E5E0D8;border-radius:8px;`)} width="${CARD_W}">
      ${img}
      <tr><td style="padding:10px 12px;background:#FAF8F4;border-radius:${c.image ? '0 0 8px 8px' : '8px'};">
        <a href="${esc(c.href)}" style="text-decoration:none;color:${TEXT};">
          ${c.title ? `<span style="display:block;font-size:${m.fs}px;line-height:1.4;font-weight:bold;color:${TEXT};">${txt(c.title)}</span>` : ''}
          <span style="display:block;font-size:${m.fs - 1}px;line-height:1.5;color:${m.accent};">${txt(c.host, 'ltr')} ${arrow(m)}</span>
        </a>
      </td></tr>
    </table>`;
  }

  function extras(m) {
    return siteCard(m) + (m.disclaimer
      ? `<div style="font-size:${m.fs - 2}px;line-height:1.5;color:${MUTED};margin-top:14px;max-width:460px;">${m.disclaimer.split('\n').map(l => txt(l)).join('<br />')}</div>`
      : '');
  }

  const signoff = m => m.signoff
    ? `<div style="font-size:${m.fs + 1}px;line-height:1.5;color:${TEXT};margin:0 0 12px;">${txt(m.signoff)}</div>` : '';

  // Direction is set on the table too: some clients don't inherit it into tables.
  const wrap = (m, inner) =>
    `<table dir="${m.dir}" ${tableWith(`direction:${m.dir};font-family:${m.font};color:${TEXT};`)}>${inner}</table>`;

  // ---------- Templates ----------
  const TEMPLATES = {
    classic: {
      name: 'Classic',
      thumb: [['i', 10, 14, 26, 26, '50%'], ['a', 42, 10, 2, 34], ['i', 50, 12, 40, 6], ['a', 50, 22, 28, 4], ['i', 50, 32, 46, 3], ['i', 50, 39, 38, 3]],
      build(m) {
        const divider = `<td width="2" valign="top" style="width:2px;background:${m.accent};font-size:0;line-height:0;">&nbsp;</td>`;
        const lead = m.photo
          ? `<td valign="middle" style="vertical-align:middle;">${photoImg(m)}</td>${spacer(16)}${divider}${spacer(16)}<td valign="top">`
          : `${divider}${spacer(16)}<td valign="top">`;
        return signoff(m) + wrap(m, `<tr>${lead}
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
        const photo = m.photo ? `<td valign="middle">${photoImg(m)}</td>${spacer(18)}` : '';
        const role = roleText(m, ' · ');
        return signoff(m) + wrap(m, `<tr>${photo}<td valign="middle">
          ${nameLine(m, m.fs + 9)}
          ${role ? `<div style="font-size:${m.fs - 1}px;line-height:1.5;margin-top:4px;letter-spacing:${m.rtl ? 0 : 1.5}px;text-transform:uppercase;color:${m.accent};font-weight:bold;">${role}</div>` : ''}
          </td></tr>
          <tr><td colspan="${m.photo ? 3 : 1}" style="padding:12px 0 0;">
            <div style="border-top:1px solid ${m.accent};height:1px;line-height:1px;font-size:0;max-width:460px;">&nbsp;</div>
          </td></tr>
          <tr><td colspan="${m.photo ? 3 : 1}" style="padding:10px 0 0;">
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
        const role = roleText(m, ', ');
        const contacts = m.contacts.map(c => {
          const val = contactValue(m, c);
          return m.iconSet ? `<span style="white-space:nowrap;">${iconImg(m, c.icon, m.fs)}&nbsp;${val}</span>` : val;
        });
        const socials = m.iconSet
          ? (m.socials.length ? [m.socials.map(s => `<a href="${esc(s.href)}" style="text-decoration:none;">${iconImg(m, s.icon, m.fs + 3, s.label)}</a>`).join('&nbsp;&nbsp;')] : [])
          : m.socials.map(s => link(m, s.href, s.label, m.accent));
        return signoff(m) + wrap(m, `<tr><td>
          ${nameLine(m, m.fs + 1)}
          ${role ? `<div style="font-size:${m.fs}px;line-height:1.5;color:${MUTED};">${role}</div>` : ''}
          <div style="font-size:${m.fs}px;line-height:1.8;color:${MUTED};margin-top:4px;">
            ${[...contacts, ...socials].join(`<span style="color:#BDB6AB;"> &nbsp;|&nbsp; </span>`)}
          </div>
          ${m.cta ? `<div style="font-size:${m.fs}px;line-height:1.6;margin-top:6px;"><a href="${esc(m.cta.href)}" style="color:${m.accent};text-decoration:none;">${txt(m.cta.text)} ${arrow(m)}</a></div>` : ''}
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
            ${roleLine(m, { joiner: m.rtl ? ' · ' : ' at ' })}
          </td></tr>
          <tr><td style="padding:12px 0 0;">
            <table ${TABLE}>
              ${m.contacts.map(c => `<tr>
                ${m.iconSet
                  ? `<td style="padding:2px 0;line-height:0;" valign="middle">${iconImg(m, c.icon)}</td>${spacer(10)}`
                  : m.iconStyle === 'text'
                    ? `<td style="padding:0 0 2px;font-size:${m.fs - 1}px;line-height:1.6;color:${m.accent};font-weight:bold;letter-spacing:${m.rtl ? 0 : 1}px;text-transform:uppercase;" valign="top">${txt(c.word)}</td>${spacer(12)}`
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
        const photo = m.photo ? `<td valign="middle">${photoImg(m, Math.min(m.photoSize, 64))}</td>${spacer(14)}` : '';
        const role = roleText(m, ' · ');
        return signoff(m) + wrap(m, `
          <tr><td style="background:${m.accent};border-radius:8px;padding:14px 18px;">
            <table ${TABLE}><tr>
              ${photo}
              <td valign="middle">
                ${nameLine(m, m.fs + 5, { color: '#FFFFFF' })}
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
    // Explicit direction on the outer wrapper, so an LTR signature stays LTR in a
    // Hebrew/Arabic mail client and vice versa.
    const body = tpl.build(m).replace(/\n\s+/g, '\n').trim();
    return `<div dir="${m.dir}" style="direction:${m.dir};">${body}</div>`;
  }

  function hasContent() {
    return ['name', 'title', 'company', 'email', 'phone', 'website'].some(k => String(state[k] || '').trim());
  }

  function render() {
    preview.innerHTML = hasContent()
      ? signatureHtml()
      : '<p class="sig-empty">Start typing on the left — your signature will appear here.</p>';
    syncPhotoUI();
    syncCardUI();
    syncAnim();
    syncDir();
    watchPhoto();
    updateHints();
    persist();
  }

  // ---------- Animated text queue ----------
  // Accent GIFs are made in the background (anim.js) and cached; until one is
  // ready the signature simply renders without it.
  const animCache = new Map(); // key -> { status: 'pending' | 'ready' | 'error', gif }
  const animQueue = new Map();
  let animTimer = 0;

  function requestAnim(opts) {
    // The photo's data URL is long; key on a fingerprint of it instead.
    const src = opts.src || '';
    const key = JSON.stringify({ ...opts, src: `${src.length}:${src.slice(-48)}:${src.slice(200, 248)}` });
    const hit = animCache.get(key);
    if (hit) return hit.status === 'ready' ? hit.gif : null;
    animQueue.set(key, opts);
    clearTimeout(animTimer);
    animTimer = setTimeout(flushAnim, 400);
    return null;
  }

  async function flushAnim() {
    const jobs = [...animQueue];
    animQueue.clear();
    for (const [key, opts] of jobs) {
      animCache.set(key, { status: 'pending' });
      try {
        animCache.set(key, { status: 'ready', gif: await window.SigAnim.make(opts) });
      } catch (err) {
        console.warn('Animation failed:', err);
        animCache.set(key, { status: 'error' });
      }
    }
    // Keep the cache small: drop the oldest entries.
    while (animCache.size > 40) animCache.delete(animCache.keys().next().value);
    render();
  }

  // ---------- Photo animation picker ----------
  const ANIM_NOTES = {
    glow: 'The ring around your photo softly brightens twice every few seconds.',
    orbit: 'A small light travels once around your photo every few seconds.',
    story: 'A soft gradient ring slowly turns around your photo.',
    shimmer: 'A gentle light sweeps across your photo every few seconds.',
  };
  function syncAnim() {
    $('#ctaPulse').checked = !!state.ctaPulse;
    const effect = PHOTO_ANIMS.includes(state.photoAnim) ? state.photoAnim : 'none';
    document.querySelectorAll('#animPicker [data-anim]').forEach(b =>
      b.setAttribute('aria-checked', String(b.dataset.anim === effect)));
    const hasPhoto = isImageData(state.photoData) && !(state.photoHost && toUrl(state.photoHosted));
    $('#animNote').textContent = effect === 'none' ? ''
      : !hasPhoto ? 'Add a photo above (upload or link) to see the animation. It isn’t available when hosting the photo online.'
        : `${ANIM_NOTES[effect]} Plays in Gmail, Apple Mail and new Outlook; classic Outlook for Windows shows it still.`;
  }
  $('#ctaPulse').addEventListener('change', e => { state.ctaPulse = e.target.checked; render(); });
  $('#animPicker').addEventListener('click', e => {
    const btn = e.target.closest('[data-anim]');
    if (!btn) return;
    state.photoAnim = btn.dataset.anim;
    render();
  });

  // ---------- Text direction picker ----------
  function syncDir() {
    const choice = ['ltr', 'rtl'].includes(state.dir) ? state.dir : 'auto';
    document.querySelectorAll('#dirPicker [data-dir]').forEach(b =>
      b.setAttribute('aria-checked', String(b.dataset.dir === choice)));
    const detected = resolveDir(state) === 'rtl' ? 'right-to-left' : 'left-to-right';
    $('#dirNote').textContent = choice === 'auto'
      ? `Using ${detected}, based on the language of your details. Hebrew or Arabic mixed with English works in every mode.`
      : choice === 'rtl'
        ? 'Mirrored layout for Hebrew or Arabic. Phone numbers, emails and links stay left-to-right.'
        : 'Left-to-right layout. Any Hebrew or Arabic text inside it still reads correctly.';
  }

  $('#dirPicker').addEventListener('click', e => {
    const btn = e.target.closest('[data-dir]');
    if (!btn) return;
    state.dir = btn.dataset.dir;
    render();
  });

  // Let the form fields follow what's typed in them (Hebrew aligns right),
  // while numbers, emails and links always stay left-to-right.
  document.querySelectorAll('[data-key]').forEach(el => {
    if (el.matches('input[type="text"], textarea')) el.dir = 'auto';
    else if (el.matches('input[type="email"], input[type="tel"], input[type="url"]')) el.dir = 'ltr';
  });

  // ---------- Field hints ----------
  // Invalid values are left out of the signature; say so instead of silently dropping them.
  const touched = new Set();
  let photoFailedFor = ''; // pasted image URL that failed to load in the preview

  // Watch the preview's photo so broken or private links are reported.
  function watchPhoto() {
    const url = photoLink(state.photo).url;
    if (!url) return;
    const img = [...preview.querySelectorAll('img')].find(i => i.getAttribute('src') === url);
    if (!img) return;
    img.addEventListener('error', () => { photoFailedFor = url; updateHints(); }, { once: true });
    img.addEventListener('load', () => {
      if (photoFailedFor === url) { photoFailedFor = ''; updateHints(); }
    }, { once: true });
  }

  function fieldIssue(key) {
    const v = String(state[key] || '').trim();
    const hasCtaText = !!String(state.ctaText || '').trim();
    const hasCtaUrl = !!toUrl(state.ctaUrl);
    switch (key) {
      case 'email':
        return v && !EMAIL_RE.test(v) ? 'This doesn’t look like an email address, so it’s left out.' : '';
      case 'phone':
        return v && !PHONE_RE.test(v) ? 'Use only digits, spaces and + ( ) - so tap-to-call works.' : '';
      case 'linkedin': case 'instagram': case 'twitter': case 'facebook': case 'youtube':
      case 'tiktok': case 'github': case 'behance': case 'dribbble':
        return v && !profileUrl(key, v) ? 'Enter a profile link or username — this one is left out.' : '';
      case 'whatsapp':
        if (!v || profileUrl(key, v)) return '';
        return v.replace(/[^\d+]/g, '').startsWith('0')
          ? 'Add your country code, e.g. +972 50 123 4567 — WhatsApp links need it.'
          : 'Enter your WhatsApp number with country code, e.g. +972 50 123 4567.';
      case 'website': case 'portfolio':
        return v && !toUrl(v) ? 'Enter a web address like example.com — this one is left out.' : '';
      case 'photo': {
        if (!v) return '';
        if (!toUrl(v)) return 'Enter an image link starting with https:// — or use Upload image above.';
        const p = photoLink(v);
        if (p.problem) return p.problem;
        if (p.url && photoFailedFor === p.url) return 'This image couldn’t be loaded. Check the link is public (not private or sign-in only), or use Upload image above.';
        return '';
      }
      case 'ctaUrl':
        if (v && !hasCtaUrl) return 'Enter a web address like cal.com/you — the button is hidden until then.';
        return !v && hasCtaText ? 'Add a link — the button only appears once it has one.' : '';
      case 'ctaText':
        return !v && hasCtaUrl ? 'Add button text — the button only appears once it has some.' : '';
      default:
        return '';
    }
  }

  // The two call-to-action fields depend on each other.
  const PARTNER = { ctaUrl: 'ctaText', ctaText: 'ctaUrl' };

  function updateHints() {
    document.querySelectorAll('[data-key]').forEach(el => {
      const key = el.dataset.key;
      const hint = document.getElementById(`hint-${key}`);
      if (!hint) return;
      // Pasted image links get feedback straight away; other fields after first blur.
      const show = key === 'photo' || touched.has(key) || touched.has(PARTNER[key]);
      const problem = show ? fieldIssue(key) : '';
      const note = !problem && key === 'photo' ? photoLink(state.photo).note || '' : '';
      hint.textContent = problem || note;
      hint.hidden = !(problem || note);
      hint.classList.toggle('is-info', !!note);
      el.setAttribute('aria-invalid', String(!!problem));
    });
  }

  function addHintSlots() {
    ['email', 'phone', 'website', ...PROFILES.map(p => p.key), 'photo', 'ctaText', 'ctaUrl'].forEach(key => {
      const el = document.querySelector(`[data-key="${key}"]`);
      const hint = document.createElement('small');
      hint.className = 'field-hint';
      hint.id = `hint-${key}`;
      hint.hidden = true;
      el.insertAdjacentElement('afterend', hint);
      el.setAttribute('aria-describedby', hint.id);
    });
  }

  // ---------- Photo ----------
  // By default the photo never leaves the browser: it's cropped, shaped and
  // shrunk to 240px (2× the largest display size), then embedded in the
  // signature as a data URI. Gmail turns that into an inline attachment of
  // every email sent, so it can't break later. Hosting via /api/upload is an
  // opt-in for mail apps that drop embedded images.
  //
  // state.photoOrig keeps a downscaled copy of the original so shape/fit
  // changes can be re-applied later, even after a reload.
  const IMG_PX = 240;
  const ORIG_PX = 480;
  const uploadEl = $('#upload');
  const uploadStatus = $('#uploadStatus');
  const hostToggle = $('#photoHost');
  const DEFAULT_UPLOAD_MSG = uploadStatus.textContent;
  const EMBEDDED_MSG = 'Photo added and embedded in your signature — nothing was uploaded.';
  const HOSTED_MSG = 'Photo hosted online — it loads from a link in every email app.';
  let uploadSeq = 0;

  function setUploadStatus(msg, tone = '') {
    uploadStatus.textContent = msg;
    uploadStatus.className = 'upload-status' + (tone ? ` is-${tone}` : '');
  }

  function syncPhotoUI() {
    const src = photoSrc(state);
    const thumb = $('#uploadThumb');
    thumb.style.backgroundImage = src ? `url("${src.replace(/"/g, '%22')}")` : '';
    thumb.style.backgroundSize = state.photoFit === 'contain' ? 'contain' : 'cover';
    thumb.style.borderRadius = state.photoShape === 'circle' ? '50%' : state.photoShape === 'rounded' ? '10px' : '4px';
    $('#photoRemove').hidden = !src;
    $('#uploadLabel').textContent = src ? 'Replace image' : 'Upload image';
    hostToggle.checked = !!state.photoHost;
  }

  // Accepts a File/Blob or a data: URL string.
  async function loadImage(source) {
    if (source instanceof Blob && window.createImageBitmap) {
      try {
        const bmp = await createImageBitmap(source);
        return { src: bmp, sw: bmp.width, sh: bmp.height };
      } catch { /* fall through (e.g. older Safari with some formats) */ }
    }
    const objUrl = source instanceof Blob ? URL.createObjectURL(source) : '';
    try {
      const img = new Image();
      await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = objUrl || source; });
      return { src: img, sw: img.naturalWidth, sh: img.naturalHeight };
    } finally { if (objUrl) URL.revokeObjectURL(objUrl); }
  }

  const toBlob = (canvas, type) => new Promise(r => canvas.toBlob(r, type, 0.88));

  // Downscaled original, kept (as a data URL) so the photo can be re-shaped later.
  async function makeOriginal(file) {
    const { src, sw, sh } = await loadImage(file);
    const s = Math.min(1, ORIG_PX / Math.max(sw, sh));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(sw * s);
    canvas.height = Math.round(sh * s);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
    // Keep PNG for sources that may be transparent logos.
    const jpeg = typeof file === 'string' ? file.startsWith('data:image/jpeg') : file.type === 'image/jpeg';
    return canvas.toDataURL(jpeg ? 'image/jpeg' : 'image/png', 0.9);
  }

  async function prepareImage(source, fit, shape) {
    const { src: img, sw, sh } = await loadImage(source);
    const fromJpeg = typeof source === 'string' ? source.startsWith('data:image/jpeg') : source.type === 'image/jpeg';

    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = IMG_PX;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';

    // Outlook for Windows ignores border-radius, so round/rounded shapes are cut
    // into the image itself (transparent corners, hence PNG). Square photos stay
    // compact JPEGs on white; square logos keep their transparency.
    const shaped = shape === 'circle' || shape === 'rounded';
    const transparent = shaped || (fit === 'contain' && !fromJpeg);
    const type = transparent ? 'image/png' : 'image/jpeg';

    if (shaped) {
      ctx.beginPath();
      if (shape === 'circle') ctx.arc(IMG_PX / 2, IMG_PX / 2, IMG_PX / 2, 0, Math.PI * 2);
      else ctx.roundRect(0, 0, IMG_PX, IMG_PX, IMG_PX * ROUNDED_RATIO);
      ctx.clip();
    }
    // Photos get a white backing so transparent PNG sources don't show holes.
    if (fit !== 'contain' || !transparent) { ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, IMG_PX, IMG_PX); }

    if (fit === 'contain') {
      const s = Math.min(IMG_PX / sw, IMG_PX / sh);
      ctx.drawImage(img, (IMG_PX - sw * s) / 2, (IMG_PX - sh * s) / 2, sw * s, sh * s);
    } else {
      const side = Math.min(sw, sh);
      ctx.drawImage(img, (sw - side) / 2, (sh - side) / 2, side, side, 0, 0, IMG_PX, IMG_PX);
    }
    return { blob: await toBlob(canvas, type), dataUrl: canvas.toDataURL(type, 0.88) };
  }

  async function hostImage(blob) {
    if (!/^https?:$/.test(location.protocol)) throw new Error('Not served over http');
    const res = await fetch('/api/upload', { method: 'POST', headers: { 'content-type': blob.type }, body: blob });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.url) {
      const err = new Error(data.error || `Upload failed (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return data.url;
  }

  // Hosted URLs for the current photo, per fit+shape, so toggling back and
  // forth between options doesn't upload the same image again.
  let variants = new Map();

  // (Re)build the signature photo from state.photoOrig with the current options.
  async function applyPhoto() {
    if (!isImageData(state.photoOrig)) return;
    const seq = ++uploadSeq;
    const label = $('#uploadLabel').parentElement;
    const key = `${state.photoFit}|${state.photoShape}`;

    if (state.photoHost && variants.has(key)) {
      state.photoHosted = variants.get(key);
      setUploadStatus(HOSTED_MSG, 'ok');
      syncFields();
      render();
      return;
    }

    label.classList.add('is-busy');
    try {
      const { blob, dataUrl } = await prepareImage(state.photoOrig, state.photoFit, state.photoShape);
      if (seq !== uploadSeq) return;
      state.photoData = dataUrl;
      state.photoHosted = '';
      syncFields();
      render();

      if (!state.photoHost) {
        setUploadStatus(EMBEDDED_MSG, 'ok');
        return;
      }
      setUploadStatus('Uploading…');
      try {
        const url = await hostImage(blob);
        if (seq !== uploadSeq) return;
        variants.set(key, url);
        state.photoHosted = url;
        setUploadStatus(HOSTED_MSG, 'ok');
      } catch (err) {
        if (seq !== uploadSeq) return;
        console.warn('Image hosting unavailable:', err.message);
        setUploadStatus(`${err.status === 429 ? err.message : 'Couldn’t host the photo online.'} It’s embedded in the signature instead, which works in Gmail.`, 'warn');
      }
      syncFields();
      render();
    } catch {
      if (seq === uploadSeq) setUploadStatus('Couldn’t read that image. Try a PNG or JPG.', 'warn');
    } finally {
      if (seq === uploadSeq) label.classList.remove('is-busy');
    }
  }

  async function handleFile(file) {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) return setUploadStatus('Please choose a PNG, JPG or WebP image.', 'warn');
    if (file.size > 15 * 1024 * 1024) return setUploadStatus('That image is over 15 MB — please pick a smaller one.', 'warn');
    setUploadStatus('Preparing image…');
    try {
      state.photoOrig = await makeOriginal(file);
    } catch {
      return setUploadStatus('Couldn’t read that image. Try a PNG or JPG.', 'warn');
    }
    state.photo = '';
    state.photoFrom = '';
    variants = new Map();
    await applyPhoto();
  }

  // A pasted image link is fetched once (via /api/image, public hosts only) and
  // then cropped, shaped and embedded like an upload. Mail apps ignore
  // object-fit, so using the link directly squashes non-square photos.
  let linkTimer = 0;
  async function importPhotoLink() {
    const link = String(state.photo || '').trim();
    const { url, problem } = photoLink(link);
    if (!url || (problem && !url)) return;
    if (state.photoFrom === link && isImageData(state.photoData)) return;

    const seq = ++uploadSeq;
    setUploadStatus('Loading the image from your link…');
    try {
      if (!/^https?:$/.test(location.protocol)) throw new Error('Image links can only be processed on the live site.');
      const res = await fetch('/api/image?url=' + encodeURIComponent(url));
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.image) throw new Error(data.error || 'Couldn’t load that image.');
      const orig = await makeOriginal(data.image);
      if (seq !== uploadSeq || String(state.photo || '').trim() !== link) return;
      state.photoOrig = orig;
      state.photoFrom = link;
      variants = new Map();
      await applyPhoto();
    } catch (err) {
      if (seq === uploadSeq) setUploadStatus(`${err.message} The link is used as-is, which can look squashed in some email apps.`, 'warn');
    }
  }

  function clearPhoto(msg = DEFAULT_UPLOAD_MSG) {
    uploadSeq++;
    variants = new Map();
    state.photo = '';
    state.photoData = '';
    state.photoOrig = '';
    state.photoHosted = '';
    state.photoFrom = '';
    $('#uploadLabel').parentElement.classList.remove('is-busy');
    setUploadStatus(msg);
  }

  $('#photoFile').addEventListener('change', e => {
    handleFile(e.target.files[0]);
    e.target.value = '';
  });
  $('#photoRemove').addEventListener('click', () => { clearPhoto(); syncFields(); render(); });
  hostToggle.addEventListener('change', () => {
    state.photoHost = hostToggle.checked;
    if (isImageData(state.photoOrig)) applyPhoto();
    else persist();
  });

  ['dragenter', 'dragover'].forEach(t => uploadEl.addEventListener(t, e => {
    e.preventDefault();
    uploadEl.classList.add('is-drag');
  }));
  ['dragleave', 'drop'].forEach(t => uploadEl.addEventListener(t, () => uploadEl.classList.remove('is-drag')));
  uploadEl.addEventListener('drop', e => {
    e.preventDefault();
    handleFile(e.dataTransfer.files[0]);
  });

  // ---------- Website preview card ----------
  // /api/preview reads the site's og:title / og:image; the image is cropped
  // here to the card size and embedded, like the photo.
  const siteToggle = $('#siteCard');
  const siteStatus = $('#siteCardStatus');
  const siteTitleField = $('#siteCardTitleField');
  let cardSeq = 0;
  let cardTimer = 0;

  function setCardStatus(msg, tone = '') {
    siteStatus.textContent = msg;
    siteStatus.hidden = !msg;
    siteStatus.className = 'upload-status' + (tone ? ` is-${tone}` : '');
  }

  function syncCardUI() {
    siteToggle.checked = !!state.siteCard;
    siteTitleField.hidden = !(state.siteCard && state.siteCardFor && state.siteCardFor === toUrl(state.website));
  }

  // 2× the displayed card size, cropped to fill.
  async function cropCardImage(dataUrl) {
    const { src, sw, sh } = await loadImage(dataUrl);
    const W = CARD_W * 2, H = CARD_H * 2;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, W, H);
    const s = Math.max(W / sw, H / sh);
    ctx.drawImage(src, (W - sw * s) / 2, (H - sh * s) / 2, sw * s, sh * s);
    return canvas.toDataURL('image/jpeg', 0.85);
  }

  async function fetchCard() {
    if (!state.siteCard) return;
    const site = toUrl(state.website);
    if (!site) return setCardStatus('Add your website address above to create the card.', 'warn');
    if (site === state.siteCardFor) return;

    const seq = ++cardSeq;
    setCardStatus('Reading your website…');
    try {
      if (!/^https?:$/.test(location.protocol)) throw new Error('Preview cards only work on the live site.');
      const res = await fetch('/api/preview?url=' + encodeURIComponent(site));
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Couldn’t read that website (${res.status}).`);
      const image = data.image ? await cropCardImage(data.image).catch(() => '') : '';
      if (seq !== cardSeq) return;
      state.siteCardFor = site;
      state.siteCardImage = image;
      state.siteCardTitle = data.title || data.siteName || '';
      setCardStatus(image
        ? 'Preview card added. The image is embedded, like your photo.'
        : 'This site has no preview image, so the card shows its title only.', image ? 'ok' : 'warn');
      syncFields();
      render();
    } catch (err) {
      if (seq === cardSeq) setCardStatus(err.message, 'warn');
    }
  }

  siteToggle.addEventListener('change', () => {
    state.siteCard = siteToggle.checked;
    if (state.siteCard) fetchCard();
    else { cardSeq++; setCardStatus(''); }
    render();
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
      // Hints appear after the first blur, then update live while typing.
      el.addEventListener('blur', () => {
        if (touched.has(el.dataset.key)) return;
        touched.add(el.dataset.key);
        updateHints();
      });
      el.addEventListener('input', () => {
        const key = el.dataset.key;
        state[key] = el.value;
        // A pasted link replaces any uploaded image.
        if (key === 'photo') {
          uploadSeq++;
          variants = new Map();
          state.photoData = '';
          state.photoOrig = '';
          state.photoHosted = '';
          state.photoFrom = '';
          setUploadStatus(DEFAULT_UPLOAD_MSG);
          clearTimeout(linkTimer);
          linkTimer = setTimeout(importPhotoLink, 700);
        }
        render();
        // Fit and shape are baked into uploaded images, so re-process the file.
        if (key === 'photoFit' || key === 'photoShape') applyPhoto();
        // Refresh the preview card once typing in the website field pauses.
        if (key === 'website' && state.siteCard) {
          clearTimeout(cardTimer);
          cardTimer = setTimeout(fetchCard, 800);
        }
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
    const plain = tmp.cloneNode(true);
    plain.querySelectorAll('img[alt]').forEach(img => { if (img.alt) img.replaceWith(img.alt); });
    try {
      if (window.ClipboardItem && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([plain.innerText], { type: 'text/plain' }),
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
  addHintSlots();
  // Flag problems in saved values straight away.
  Object.keys(state).forEach(k => { if (String(state[k] || '').trim()) touched.add(k); });
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

  // ---------- Feedback ----------
  const fbDialog = $('#feedbackDialog');
  const fbForm = $('#feedbackForm');
  const fbStatus = $('#feedbackStatus');
  const fbSend = $('#feedbackSend');
  let fbKind = 'idea';

  const setFbStatus = (msg, tone = '') => {
    fbStatus.textContent = msg;
    fbStatus.className = 'upload-status' + (tone ? ` is-${tone}` : '');
  };

  document.querySelectorAll('[data-open-feedback]').forEach(b => b.addEventListener('click', () => {
    setFbStatus('');
    fbSend.disabled = false;
    fbSend.textContent = 'Send';
    // Every new message starts as an Idea.
    fbKind = 'idea';
    fbForm.querySelectorAll('[data-kind]').forEach(x => x.setAttribute('aria-checked', String(x.dataset.kind === 'idea')));
    fbDialog.showModal();
    $('#feedbackMessage').focus();
  }));
  $('#feedbackClose').addEventListener('click', () => fbDialog.close());
  $('#feedbackCancel').addEventListener('click', () => fbDialog.close());
  fbDialog.addEventListener('click', e => { if (e.target === fbDialog) fbDialog.close(); }); // backdrop

  fbForm.querySelectorAll('[data-kind]').forEach(b => b.addEventListener('click', () => {
    fbKind = b.dataset.kind;
    fbForm.querySelectorAll('[data-kind]').forEach(x => x.setAttribute('aria-checked', String(x === b)));
  }));

  fbForm.addEventListener('submit', async e => {
    e.preventDefault();
    const message = $('#feedbackMessage').value.trim();
    const email = $('#feedbackEmail').value.trim();
    if (message.length < 3) return setFbStatus('Please write a little more.', 'warn');
    if (email && !EMAIL_RE.test(email)) return setFbStatus('That email address doesn’t look right — or leave it empty.', 'warn');

    fbSend.disabled = true;
    fbSend.textContent = 'Sending…';
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message, email, kind: fbKind }),
      });
      const data = await res.json().catch(() => ({}));
      // Only a response carrying the saved file's URL counts as sent.
      if (!res.ok || !data.url) throw new Error(data.error || 'Couldn’t send your feedback. Please try again.');
      fbForm.reset();
      setFbStatus('Thank you! Your feedback was sent.', 'ok');
      fbSend.textContent = 'Sent';
      setTimeout(() => fbDialog.close(), 1600);
    } catch (err) {
      setFbStatus(err.message, 'warn');
      fbSend.disabled = false;
      fbSend.textContent = 'Send';
    }
  });

  // "More profiles" reveals the less common profile fields.
  const moreBtn = $('#moreProfiles');
  const setMoreOpen = open => {
    $('#moreProfileFields').hidden = !open;
    moreBtn.setAttribute('aria-expanded', String(open));
    moreBtn.textContent = open ? 'Fewer profiles' : 'More profiles (X, Facebook, YouTube, TikTok, GitHub…)';
  };
  setMoreOpen(PROFILES.some(p => !p.primary && String(state[p.key] || '').trim()));
  moreBtn.addEventListener('click', () => setMoreOpen($('#moreProfileFields').hidden));

  if (state.siteCard) fetchCard();
  // Saved photo state: older saves kept a hosted URL in the link field — treat
  // it like any pasted link (re-embedded below).
  if (isImageData(state.photoOrig)) setUploadStatus(state.photoHost && toUrl(state.photoHosted) ? HOSTED_MSG : EMBEDDED_MSG, 'ok');
  if (String(state.photo || '').trim() && state.photoFrom !== String(state.photo).trim()) importPhotoLink();

  $('#reset').addEventListener('click', () => {
    clearPhoto();
    cardSeq++;
    setCardStatus('');
    touched.clear();
    state = { ...EMPTY };
    syncFields();
    render();
    flash('Cleared.');
  });

  document.querySelectorAll('.preview-head .seg-btn').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('.preview-head .seg-btn').forEach(b => b.classList.toggle('is-active', b === btn));
    $('#mail').classList.toggle('is-mobile', btn.dataset.view === 'mobile');
  }));

  // Preview in an approximation of mail apps' dark mode (Gmail on phones inverts
  // text colours but leaves images alone).
  $('#darkPreview').addEventListener('click', e => {
    const on = !$('#mail').classList.contains('is-dark');
    $('#mail').classList.toggle('is-dark', on);
    e.currentTarget.setAttribute('aria-pressed', String(on));
  });

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
