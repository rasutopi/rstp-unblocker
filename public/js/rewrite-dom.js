// ============================
// DOMの書き換え
// Copyright 2026 Team xxxxxxx
// ============================

(() => {
  const ORIGIN_ATTR = 'data-origin-url';

  /**
   * ページのベースURLを取得する
   * .origin ではなく URL 全体を返すことで /foo/ などの階層を維持する
   */
  function getPageBase() {
    const body = document.body;
    if (!body) return null;
    const attr = body.getAttribute(ORIGIN_ATTR);
    if (!attr) return null;
    try {
      // 解決の基準にするため、href（フルURL）として返す
      return new URL(attr).href;
    } catch (e) {
      console.error('Invalid data-origin-url:', attr);
      return null;
    }
  }

  function rewriteUrl(rawUrl) {
    const baseFullUrl = getPageBase();
    // baseFullUrl が取得できない、または特殊なプロトコルはスキップ
    if (!baseFullUrl || !rawUrl || /^(javascript:|mailto:|tel:)/i.test(rawUrl)) {
      return rawUrl;
    }

    try {
      // new URL(相対パス, ベースURL) でブラウザ標準の解決を行う
      const resolvedUrl = new URL(rawUrl, baseFullUrl);
      
      // すでにプロキシ処理済み（パラメータ付与済み等）ならスキップ
      if (resolvedUrl.searchParams.has('__p_origin')) return rawUrl;
      
      // makeProxiedUrl は外部で定義されている前提
      return typeof makeProxiedUrl === 'function' 
        ? makeProxiedUrl(resolvedUrl.toString()) 
        : resolvedUrl.toString();
    } catch (e) {
      return rawUrl;
    }
  }

  const TARGET_ATTRS = {
    'A': 'href',
    'IFRAME': 'src',
    'FORM': 'action'
  };

  function processElement(el) {
    if (el.nodeType !== 1) return;
    
    const attrName = TARGET_ATTRS[el.tagName];
    if (attrName && el.hasAttribute(attrName)) {
      const original = el.getAttribute(attrName);
      const rewritten = rewriteUrl(original);
      if (original !== rewritten) {
        el.setAttribute(attrName, rewritten);

        if (el.tagName === 'FORM') {
          el.action = rewritten;
        }
      }
    }
  }

  function rewriteTree(node) {
    if (!node) return;
    processElement(node);
    if (node.querySelectorAll) {
      node.querySelectorAll('a[href], iframe[src], form[action]').forEach(processElement);
    }
  }

  const observer = new MutationObserver(mutations => {
    for (const m of mutations) {
      if (m.type === 'childList') {
        m.addedNodes.forEach(node => rewriteTree(node));
      } else if (m.type === 'attributes') {
        processElement(m.target);
      }
    }
  });

  const start = () => {
    rewriteTree(document.body);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['href', 'src', 'action']
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();

document.addEventListener('formdata', (e) => {
  const body = document.body;
  if (!body) return;

  const base = body.getAttribute('data-origin-url');
  if (!base) return;

  const origin = new URL(base).origin;

  // encodeURL はグローバルにある前提
  if (typeof encodeURL === 'function') {
    e.formData.set('__p_origin', encodeURL(origin));
  }
});

