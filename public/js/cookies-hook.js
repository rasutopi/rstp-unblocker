// ============================
// Cookieをhookするjs
// Copyright 2026 Team Sonahiru
// ============================

// ===== 生 cookie API を退避 =====
const cookieDesc =
  Object.getOwnPropertyDescriptor(Document.prototype, 'cookie') ||
  Object.getOwnPropertyDescriptor(HTMLDocument.prototype, 'cookie');

const __raw_cookie_getter = cookieDesc.get;
const __raw_cookie_setter = cookieDesc.set;

function __get_raw_cookie() {
  return __raw_cookie_getter.call(document);
}
function __set_raw_cookie(v) {
  return __raw_cookie_setter.call(document, v);
}

// ===== プロキシ用ユーティリティ =====
function encodeName(host, name) {
  const str = host + ':' + name;
  return 'p_' + btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeName(pname) {
  try {
    let raw = pname.slice(2);
    raw = raw.replace(/-/g, '+').replace(/_/g, '/');
    while (raw.length % 4) raw += '=';
    raw = atob(raw);

    const idx = raw.indexOf(':');
    return {
      host: raw.slice(0, idx),
      name: raw.slice(idx + 1)
    };
  } catch {
    return null;
  }
}

// ===== プロキシ cookie API =====
window.__p_cookie_get = function(name) {
  const raw = __get_raw_cookie();
  if (!name) return raw;

  const host = getBaseDomain(__p_location?.hostname);
  if (!host) return null;

  const cookies = raw.split(';').map(v => v.trim());
  for (const c of cookies) {
    const eq = c.indexOf('=');
    if (eq === -1) continue;

    const cname = c.slice(0, eq);
    if (!cname.startsWith('p_')) continue;

    const decoded = decodeName(cname);
    if (!decoded) continue;
    if (decoded.host === host && decoded.name === name) {
      return decodeURIComponent(c.slice(eq + 1));
    }
  }
  return null;
};

window.__p_cookie_set = function (v) {
  const parts = v.split(';').map(s => s.trim());
  const [pair, ...attrs] = parts;

  const eq = pair.indexOf('=');
  if (eq === -1) return;

  const name = pair.slice(0, eq);
  const value = pair.slice(eq + 1);

  const host = getBaseDomain(__p_location?.hostname);
  if (!host) return;

  const proxiedName = encodeName(host, name);

  // domain / secure は除外
  const filteredAttrs = attrs.filter(a =>
    !/^domain=/i.test(a) &&
    !/^secure$/i.test(a)
  );

  // Path が指定されてなければ "/" をデフォルトで保持
  if (!filteredAttrs.some(a => /^path=/i.test(a))) {
    filteredAttrs.push('Path=/');
  }

  const attrStr = '; ' + filteredAttrs.join('; ');

  __set_raw_cookie(`${proxiedName}=${encodeURIComponent(value)}${attrStr}`);
};

function getBaseDomain(host) {
  const parts = host.split('.');
  if (parts.length <= 2) return host;
  return parts.slice(-2).join('.');
}

// ===== document.cookie フック =====
Object.defineProperty(document, 'cookie', {
  configurable: true,
  enumerable: true,
  get() {
    const raw = __get_raw_cookie();
    const host = getBaseDomain(__p_location?.hostname);
    const curPath = location.pathname || '/';
    if (!host) return raw;

    const out = [];

    raw.split(';').forEach(c => {
      c = c.trim();
      const eq = c.indexOf('=');
      if (eq === -1) return;

      const name = c.slice(0, eq);
      const value = c.slice(eq + 1);

      // 生 cookie はそのまま返す
      if (!name.startsWith('p_')) {
        out.push(c);
        return;
      }

      // プロキシ cookie を展開
      const decoded = decodeName(name);
      if (!decoded || decoded.host !== host) return;

      // path 条件を簡易チェック
      const pathAttr = c.match(/;\s*Path=([^;]+)/i);
      const cookiePath = pathAttr ? pathAttr[1] : '/';
      if (!curPath.startsWith(cookiePath)) return;

      out.push(`${decoded.name}=${value}`);
    });

    return out.join('; ');
  },
  set(v) {
    __p_cookie_set(v);
  }
});
