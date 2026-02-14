// ============================
// プロキシ用のlocationを作成
// Copyright 2026 Team xxxxxxx
// ============================
(function () {
  const baseEl = document.querySelector('base[href]');
  if (!baseEl) return;

  const __p_original = new URL(baseEl.href);

  window.__p_location = {
    href: __p_original.href,
    origin: __p_original.origin,
    protocol: __p_original.protocol,
    host: __p_original.host,
    hostname: __p_original.hostname,
    port: __p_original.port,
    pathname: __p_original.pathname,
    search: __p_original.search,
    hash: __p_original.hash,

    assign(rawUrl) {
      const origin = __p_original.origin;
      const proxyOrigin = location.origin;

      const resolved = new URL(rawUrl, __p_original.href);

      const encodedOrigin = btoa(resolved.origin)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      resolved.searchParams.set('__p_origin', encodedOrigin);

      const proxied =
        proxyOrigin +
        resolved.pathname +
        resolved.search +
        resolved.hash;

      window.location.href = proxied;
    },
    reload() {
      // 現在の実際のURL（プロキシ済みのURL）を再読み込みする
      window.location.reload();
    }
  };

  document.__p_location = window.__p_location;

})();
