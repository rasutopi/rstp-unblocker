// ============================
// 汎用関数
// Copyright 2026 Team Sonahiru
// ============================

// base64エンコード（削除予定）
function encodeURL(url) {
    return btoa(url)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}


// URLをプロキシ経由のURLに変換する
// @param {string} inputUrl - 変換したいターゲットURL
// @param {string} [baseOrigin] - (任意) プロキシのオリジンを手動指定する場合。省略時は現在の場所を自動使用。

const makeProxiedUrl = (inputUrl, baseOrigin = null) => {
    if (!inputUrl) return null;

    let urlStr = inputUrl.trim();
    if (!urlStr) return null;

    // プロトコル補完
    if (!/^https?:\/\//i.test(urlStr)) urlStr = 'https://' + urlStr;

    try {
        // 現在のオリジンを自動取得 (ブラウザ or ServiceWorker)
        const currentOrigin = baseOrigin || 
                              (typeof window !== 'undefined' ? window.location.origin : 
                              (typeof self !== 'undefined' ? self.location.origin : ''));

        if (!currentOrigin) {
            console.error('現在のオリジンを取得できませんでした。baseOriginを指定してください。');
            return null;
        }

        const u = new URL(urlStr);

        // --- 1. オリジン（転送先）のエンコード処理 ---
        
        // 日本語ドメイン対応のためUTF-8バイト列にしてからBase64化
        const targetOrigin = u.origin;
        const utf8Bytes = encodeURIComponent(targetOrigin).replace(/%([0-9A-F]{2})/g,
            (match, p1) => String.fromCharCode('0x' + p1)
        );
        
        // Base64URL形式 (+ -> -, / -> _, = 削除)
        const encodedOrigin = btoa(utf8Bytes)
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');

        // --- 2. 新しいURLの生成 ---

        // クエリパラメータのマージ
        const params = new URLSearchParams(u.search);
        params.set('__p_origin', encodedOrigin);

        // 新しいURLオブジェクトを作成
        // currentOrigin をベースにして、ターゲットのパス(pathname)を結合
        const proxyUrl = new URL(u.pathname, currentOrigin);
        proxyUrl.search = params.toString();
        proxyUrl.hash = u.hash;

        return proxyUrl.toString();

    } catch (e) {
        console.error('URL処理でエラー:', e);
        return null;
    }
};