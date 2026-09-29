(() => {
  'use strict';

  // The password lives only in this tab's sessionStorage and is sent as a header.
  const KEY_STORE = 'sigmaker:inbox-key';
  const $ = sel => document.querySelector(sel);
  const KIND = { idea: 'Idea', bug: 'Something’s broken', other: 'Other' };

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

  function render(data) {
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
          el('time', { dateTime: when.toISOString(), textContent: when.toLocaleString() }),
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
