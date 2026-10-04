(() => {
  'use strict';

  // The password lives only in this tab's sessionStorage and is sent as a header.
  const KEY_STORE = 'sigmaker:inbox-key';
  const $ = sel => document.querySelector(sel);
  const KIND = { idea: 'Idea', bug: 'Bug', other: 'Other' };

  const getKey = () => { try { return sessionStorage.getItem(KEY_STORE) || ''; } catch { return ''; } };
  const setKey = v => { try { v ? sessionStorage.setItem(KEY_STORE, v) : sessionStorage.removeItem(KEY_STORE); } catch { /* ignore */ } };

  function setStatus(msg, tone = '') {
    const el = $('#status');
    el.textContent = msg;
    el.className = 'upload-status' + (tone ? ` is-${tone}` : '');
  }

  function showLogin(msg = '') {
    $('#list').hidden = true;
    $('#login').hidden = false;
    setStatus(msg, msg ? 'warn' : '');
    $('#key').focus();
  }

  async function api(method, body) {
    const res = await fetch('/api/feedback-inbox', {
      method,
      headers: { 'x-feedback-key': getKey(), ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || `Request failed (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  // Built with DOM APIs (textContent), never innerHTML, since messages are visitor input.
  function el(tag, props = {}, ...children) {
    const node = Object.assign(document.createElement(tag), props);
    children.filter(Boolean).forEach(c => node.append(c));
    return node;
  }

  // Usage: all-time and 30-day totals, plus a bar per day for the last 14 days.
  function renderUsage(stats) {
    const host = $('#usage');
    host.replaceChildren();
    if (!stats) {
      host.append(el('p', { className: 'inbox-empty', textContent: 'Usage counts start once Upstash Redis is connected in Vercel (Storage → Marketplace → Upstash).' }));
      return;
    }
    if (stats.error) {
      host.append(el('p', { className: 'inbox-empty', textContent: 'Couldn’t load usage counts right now.' }));
      return;
    }
    const sum = key => stats.days.reduce((n, d) => n + d[key], 0);
    const tile = (label, value, sub) => el('div', { className: 'usage-tile' },
      el('div', { className: 'usage-value', textContent: value.toLocaleString() }),
      el('div', { className: 'usage-label', textContent: label }),
      el('div', { className: 'usage-sub', textContent: sub }));
    host.append(el('div', { className: 'usage-tiles' },
      tile('Visits', stats.total.visit, `${sum('visit').toLocaleString()} in the last 30 days`),
      tile('Signatures created', stats.total.export, `${sum('export').toLocaleString()} in the last 30 days`)));

    const recent = stats.days.slice(-14);
    const max = Math.max(1, ...recent.map(d => d.visit), ...recent.map(d => d.export));
    const chart = el('div', { className: 'usage-chart', role: 'img', ariaLabel: 'Visits and signatures per day, last 14 days' });
    for (const d of recent) {
      const day = new Date(d.date + 'T12:00:00');
      const bar = (cls, v) => { const b = el('span', { className: `bar ${cls}` }); b.style.height = `${(v / max) * 100}%`; return b; };
      chart.append(el('div', { className: 'usage-day', title: `${day.toLocaleDateString()}: ${d.visit} visits, ${d.export} signatures` },
        el('div', { className: 'usage-bars' }, bar('bar-visit', d.visit), bar('bar-export', d.export)),
        el('div', { className: 'usage-date', textContent: day.toLocaleDateString(undefined, { day: 'numeric', month: 'numeric' }) })));
    }
    const legend = el('p', { className: 'usage-legend' }, 'Last 14 days: ',
      el('span', { className: 'dot dot-visit' }), 'visits',
      el('span', { className: 'dot dot-export' }), 'signatures');
    host.append(legend, chart);
  }

  function render(data) {
    renderUsage(data.stats);
    const host = $('#items');
    host.replaceChildren();
    $('#count').textContent = `(${data.total})`;
    if (!data.items.length) {
      host.append(el('p', { className: 'inbox-empty', textContent: 'No feedback yet.' }));
      return;
    }
    for (const item of data.items) {
      const when = new Date(item.createdAt || item.uploadedAt);
      const del = el('button', { type: 'button', className: 'link-btn', textContent: 'Delete' });
      del.addEventListener('click', async () => {
        if (!confirm('Delete this message permanently?')) return;
        try {
          await api('DELETE', { pathname: item.pathname });
          card.remove();
          setStatus('Deleted.', 'ok');
        } catch (err) { setStatus(err.message, 'warn'); }
      });
      const card = el('article', { className: 'inbox-card' },
        el('div', { className: 'inbox-meta' },
          el('span', { className: `inbox-kind kind-${item.kind || 'other'}`, textContent: KIND[item.kind] || 'Other' }),
          el('time', { dateTime: when.toISOString(), textContent: when.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) }),
          del),
        el('p', { className: 'inbox-msg', dir: 'auto', textContent: item.message || '' }),
        item.email ? el('a', { className: 'inbox-email', href: `mailto:${item.email}`, textContent: `Reply to ${item.email}` }) : null);
      host.append(card);
    }
  }

  async function load() {
    if (!getKey()) return showLogin();
    setStatus('Loading…');
    try {
      const data = await api('GET');
      $('#login').hidden = true;
      $('#list').hidden = false;
      render(data);
      setStatus('');
    } catch (err) {
      if (err.status === 401) { setKey(''); return showLogin('Wrong password.'); }
      showLogin(err.message);
    }
  }

  $('#login').addEventListener('submit', e => {
    e.preventDefault();
    setKey($('#key').value.trim());
    $('#key').value = '';
    load();
  });
  $('#refresh').addEventListener('click', load);
  $('#logout').addEventListener('click', () => { setKey(''); showLogin(); });

  load();
})();
