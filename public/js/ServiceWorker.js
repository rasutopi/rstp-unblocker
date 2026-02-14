// ============================
// Service Worker
// Copyright 2026 Team xxxxxxx
// ============================

// プロキシのオリジン (例: http://localhost:3000)
const PROXY_ORIGIN = self.location.origin;

// 1. 補助関数: 文字列を Base64url エンコード
function encodeURL(url) {
    return btoa(url)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

// 2. 補助関数: 現在のページ（クライアント）の本来のターゲットドメインを取得
// HTMLに埋め込まれた <base __p_origin> や URLパラメータから推測
async function getClientTargetOrigin(clientId) {
    const client = await self.clients.get(clientId);
    if (!client) return null;

    const url = new URL(client.url);
    const pOrigin = url.searchParams.get('__p_origin');
    
    if (pOrigin) {
        try {
            // Base64url デコード (簡易版)
            const decoded = atob(pOrigin.replace(/-/g, '+').replace(/_/g, '/'));
            return new URL(decoded).origin;
        } catch (e) {
            return null;
        }
    }
    return null;
}

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

// 3. メイン処理: fetch イベントの横取り
self.addEventListener('fetch', (event) => {
    const requestUrl = new URL(event.request.url);

    // --- スルー対象の判定 ---
    // A. プロキシ自身の資産 (/-assets/ や /ServiceWorker.js など)
    if (requestUrl.origin === PROXY_ORIGIN && 
       (requestUrl.pathname.startsWith('/-assets/') || requestUrl.pathname === '/ServiceWorker.js')) {
        return;
    }

    // B. すでにプロキシ用パラメータがついている場合は、サーバーのリライトを信じる
    if (requestUrl.searchParams.has('__p_origin')) {
        return;
    }

    // --- プロキシ書き換え処理 ---
    event.respondWith((async () => {
        let targetOrigin;

        if (requestUrl.origin === PROXY_ORIGIN) {
            // ケース1: 相対パス（またはプロキシドメインへの直接アクセス）
            // 例: fetch('/api/data') -> 現在のページのターゲットドメインを使う
            targetOrigin = await getClientTargetOrigin(event.clientId);
        } else {
            // ケース2: <base> や絶対パスによる外部ドメインへのアクセス
            // 例: <img src="https://other.com/img.png"> -> "https://other.com" をターゲットにする
            targetOrigin = requestUrl.origin;
        }

        if (!targetOrigin) {
            // ターゲットが特定できない場合は通常通りフェッチ
            return fetch(event.request);
        }

        // プロキシ用URLの構築
        const encodedOrigin = encodeURL(targetOrigin);
        const proxyUrl = new URL(requestUrl.pathname + requestUrl.search, PROXY_ORIGIN);
        proxyUrl.searchParams.set('__p_origin', encodedOrigin);

        // リクエストの再構築（POSTなどのボディも引き継ぐ）
        const modifiedRequest = new Request(proxyUrl.href, {
            method: event.request.method,
            headers: event.request.headers,
            body: event.request.method !== 'GET' && event.request.method !== 'HEAD' ? await event.request.blob() : null,
            credentials: 'include',
            redirect: 'manual' // サーバーサイドでリダイレクト処理をするため
        });

        return fetch(modifiedRequest);
    })());
});
