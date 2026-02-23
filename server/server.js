// サーバーです。
const express = require('express');
const fetch = require('node-fetch');
const cheerio = require('cheerio');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require("fs");
const jwt = require('jsonwebtoken');
const cors = require('cors');

const staticProxyRouterV1 = require("../proxies/static/v1");
// const staticProxyRouterV2 = require("../proxies/static/v2");
// const staticProxyRouterV3 = require("../proxies/static/v3");
const staticProxyRouterV4 = require("../proxies/static/v4");
const streamProxyRouterV1 = require("../proxies/streaming/v1");

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

function getUserAgent(mode, clientUA) {
    switch(mode) {
        case 'pc':
            return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36';
        case 'mobile':
            return 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/16A366';
        default:
            return clientUA;
    }
}

// ローカルアドレスの指定をチェックする関数（ChatGPT使用）
function isSafeOrigin(url) {
    try {
        const parsed = new URL(url);
        const host = parsed.hostname;

        // ホスト名が localhost かループバック系
        if (
            host === 'localhost' ||
            host === '127.0.0.1' ||
            host === '::1' ||
            host === '0.0.0.0'
        ) {
            return false;
        }

        // IPv4 アドレスかどうか
        const ipv4Match = host.match(/^(\d{1,3}\.){3}\d{1,3}$/);
        if (ipv4Match) {
            const parts = host.split('.').map(Number);

            // プライベートネットワーク
            if (
                parts[0] === 10 ||                                        // 10.0.0.0/8
                (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || // 172.16.0.0/12
                (parts[0] === 192 && parts[1] === 168) ||                 // 192.168.0.0/16
                (parts[0] === 169 && parts[1] === 254) ||                 // リンクローカル 169.254.0.0/16
                (parts[0] === 127)                                         // 127.0.0.0/8 ループバック
            ) {
                return false;
            }
        }

        // IPv6 リンクローカル / ループバック
        if (host.startsWith('fe80') || host === '::1') return false;

        // ここで外部アクセスだけ通す
        return true;
    } catch {
        return false;
    }
}

function decodeURL(encoded) {
  return Buffer.from(encoded, 'base64url').toString();
}
function encodeURL(url) {
  return Buffer.from(url).toString('base64url');
}

// cookieセット関数
function safeCookieName(name, host) {
    const payload = `${host}:${name}`;
    return `p_${Buffer.from(payload).toString('base64url')}`;
}

function storeSetCookie(fetchRes, resToClient, targetUrl) {
    const setCookies = fetchRes.headers.raw()['set-cookie'];
    if (!setCookies) return;

    const host = new URL(targetUrl).hostname;

    setCookies.forEach(c => {
        const [pair] = c.split(';');
        const eq = pair.indexOf('=');
        if (eq === -1) return;

        const rawName = pair.slice(0, eq).trim();
        const value = pair.slice(eq + 1).trim();

        const safeName = safeCookieName(rawName, host);

        resToClient.cookie(safeName, value, {
            path: '/',
            httpOnly: true,
            secure: true,
            sameSite: 'None'
        });
    });
}
// 認証ミドルウェア
function requireAuth(req, res, next) {
    const token = req.cookies.auth;
    if (!token) return res.redirect('/login?re=' + encodeURIComponent(req.originalUrl));

    try {
        jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch {
        res.clearCookie('auth');
        return res.redirect('/login?re=' + encodeURIComponent(req.originalUrl));
    }
}
// 認証を有効化
app.use((req, res, next) => {
    // 認証対象外
    const openPrefixes = ['/login', '/api/login', '/-assets/img/favicon.png', '/-assets/css/error.css', '/static-p/v1', '/static-p/v4'];

    const isOpenPrefix = openPrefixes.some(p => req.path.startsWith(p));
    const isExactRoot = req.path === '/' && req.originalUrl === '/';

    if (isOpenPrefix || isExactRoot) {
        return next();
    }

    requireAuth(req, res, next);
});

// アクセス集計（ラグいよ）
// const logPath = path.join(__dirname, "access.log");
// const accessStream = fs.createWriteStream(logPath, { flags: "a" });
// app.use((req, res, next) => {
//   const start = Date.now();

//   res.on("finish", () => {
//     const log = {
//       time: new Date().toISOString(),
//       method: req.method,
//       url: req.originalUrl,
//       status: res.statusCode,
//       duration: Date.now() - start,
//       ip: req.headers["x-forwarded-for"] || req.socket.remoteAddress
//     };

//     accessStream.write(JSON.stringify(log) + "\n");
//   });

//   next();
// });

//  アクセス時間帯を集計
const trackPath = path.join(__dirname, "viewtime.log");
const trackStream = fs.createWriteStream(trackPath, { flags: "a" });

function formatTime(date) {
  const yyyy = date.getFullYear();
  const mm   = String(date.getMonth() + 1).padStart(2, "0");
  const dd   = String(date.getDate()).padStart(2, "0");
  const hh   = String(date.getHours()).padStart(2, "0");
  const mi   = String(date.getMinutes()).padStart(2, "0");
  const ss   = String(date.getSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd} ${hh}${mi}${ss}`;
}
// トラッキングAPI
app.post("/api/track-view-time", (req, res) => {
  trackStream.write(formatTime(new Date()) + "\n");
  res.status(204).end(); // 超軽量レスポンス
});

// ルーティング（一部修正にChatGPT、Geminiを使用）
app.all('/*', async (req, res, next) => {
    try {
        const encodedUrl = req.query.__p_origin;
        if (!encodedUrl) return next();

        const originalUrl = decodeURL(encodedUrl);
        // 禁止URLチェック
        if (!isSafeOrigin(originalUrl)) {
            return res.status(403).sendFile(path.join(__dirname, '../public/html/403.html'));
        }
        // ブラウザのパスとクエリを取得して originalUrl に結合
        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        const browserUrl = new URL(req.originalUrl, `${protocol}://${req.headers.host}`);
        browserUrl.searchParams.delete('__p_origin');
        
        const fetchUrl = new URL(browserUrl.pathname + browserUrl.search, originalUrl).href;

        // User-Agent 設定
        const uaMode = req.cookies?.uaMode || 'default';
        const clientUA = req.headers['user-agent'] || '';
        const customUA = getUserAgent(uaMode, clientUA);

        // Cookie フォワード
        const forwardedCookies = [];
        const INTERNAL_COOKIES = ['auth', 'uaMode'];
        const targetHost = new URL(originalUrl).hostname;
        for (const [name, value] of Object.entries(req.cookies)) {
            if (INTERNAL_COOKIES.includes(name)) continue;
            if (name.startsWith('p_')) {
                const decoded = Buffer.from(name.slice(2), 'base64url').toString();
                const idx = decoded.indexOf(':');
                if (idx === -1) continue;
                const cookieHost = decoded.slice(0, idx);
                const originalName = decoded.slice(idx + 1);
                if (!targetHost.endsWith(cookieHost)) continue;
                forwardedCookies.push(`${originalName}=${value}`);
            }
        }

        // --- Referer の動的変換 ---
        let dynamicReferer = '';
        if (req.headers.referer) {
            try {
                const refUrl = new URL(req.headers.referer);
                const refOriginEncoded = refUrl.searchParams.get('__p_origin');
                
                if (refOriginEncoded) {
                    // プロキシ経由のアクセスなら、元のオリジンをデコードして復元
                    const originalOrigin = decodeURL(refOriginEncoded);
                    // Refererのパス部分と結合して、ターゲットサイト用のRefererを作る
                    dynamicReferer = new URL(refUrl.pathname + refUrl.search, originalOrigin).href;
                } else {
                    // パラメータがない場合は、現在のターゲットURLをRefererとして代用
                    dynamicReferer = originalUrl;
                }
            } catch (e) {
                dynamicReferer = originalUrl;
            }
        } else {
            // Refererが空の場合も、ターゲットのトップページ等をセットしておくと403を回避しやすい
            dynamicReferer = originalUrl;
        }

        // --- ヘッダーの組み立て ---
        const headers = {
            'User-Agent': customUA,
            'Cookie': forwardedCookies.join('; '),
            'Referer': dynamicReferer,
            'Origin': new URL(originalUrl).origin,
            // 以下を追加
            'Accept': req.headers['accept'] || '*/*',
            'Accept-Language': req.headers['accept-language'],
            // 'Accept-Encoding': req.headers['accept-encoding'], // ただし解凍処理に注意（後述）
        };
        if (req.headers.range) headers['Range'] = req.headers.range;
        
        const fetchOptions = {
            method: req.method,
            headers: headers,
            redirect: 'manual'
        };
        
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            // クライアントから送られたデータ (req.body) をターゲットに合わせて再シリアライズ
            if (req.headers['content-type']?.includes('application/json')) {
                fetchOptions.body = JSON.stringify(req.body);
            } else if (req.headers['content-type']?.includes('application/x-www-form-urlencoded')) {
                // 通常のフォーム送信形式
                fetchOptions.body = new URLSearchParams(req.body).toString();
            } else {
                // バイナリや不明な形式の場合、そのまま渡す (body-parser設定に依存)
                fetchOptions.body = req.body;
            }
        }

        const startTime = Date.now();
        let response = await fetch(fetchUrl, fetchOptions);
        
        // LOG OUTPUT
        const now = new Date();
        const timestamp =
          now.getFullYear() + '-' +
          String(now.getMonth() + 1).padStart(2, '0') + '-' +
          String(now.getDate()).padStart(2, '0') + ' ' +
          String(now.getHours()).padStart(2, '0') + ':' +
          String(now.getMinutes()).padStart(2, '0') + ':' +
          String(now.getSeconds()).padStart(2, '0');
        const ip =
          (req.headers['x-forwarded-for']?.split(',')[0] || '')
            .trim() ||
          req.socket.remoteAddress;        

        const duration = Date.now() - startTime;

        pushLog({
            time: timestamp,
            ip,
            method: req.method,
            status: response.status,
            url: fetchUrl,
            duration: duration
        });
        storeSetCookie(response, res, fetchUrl);

        let finalUrl = fetchUrl;
        let maxRedirects = 10;

        // --- リダイレクト処理 ---
        while (response.status >= 300 && response.status < 400 && maxRedirects-- > 0) {
            const locationHeader = response.headers.get('location');
            if (!locationHeader) break;

            const locUrl = new URL(locationHeader, finalUrl);

            const encodedDomain = encodeURL(locUrl.origin);

            const separator = locUrl.search ? '&' : '?';
            const proxiedUrl = `${locUrl.pathname}${locUrl.search}${separator}__p_origin=${encodeURIComponent(encodedDomain)}`;

            return res.redirect(proxiedUrl);
        }

        const contentType = response.headers.get('content-type') || '';

        // --- 動画 / バイナリ ---
        if (contentType.startsWith('video/')) {
            res.status(response.status);
            response.headers.forEach((value, key) => res.set(key, value));
            response.body.pipe(res);
            return;
        }

        // --- CSS ---
        if (contentType.includes('text/css')) {
            let cssText = await response.text();

            // fetchUrl を基準に絶対 URL を作る
            const base = new URL(fetchUrl);

            cssText = cssText.replace(/url\(([^)]+)\)/g, (match, rawUrl) => {
                let url = rawUrl.trim().replace(/^['"]|['"]$/g, '');

                // data: は無視
                if (url.startsWith('data:')) return match;

                // すでに http/https の絶対 URL → そのまま
                if (/^https?:\/\//.test(url)) return match;

                // //example.com のようなプロトコル相対
                if (url.startsWith('//')) {
                    const abs = base.protocol + url;
                    return `url("${abs}")`;
                }

                // /hoge → origin + /hoge
                if (url.startsWith('/')) {
                    const abs = base.origin + url;

                    const encoded = encodeURIComponent(encodeURL(base.origin));
                    return `url("${abs}")`;
                }

                // 相対パス → fetchUrl のディレクトリ基準
                const abs = new URL(url, base).href;
                const encoded = encodeURIComponent(encodeURL(base.origin));
                return `url("${abs}")`;
            });

            res.set('Content-Type', contentType);
            return res.send(cssText);
        }

        // --- JavaScript ---
        if (contentType.includes('javascript')) {
            let jsText = await response.text();

            // 1. location オブジェクトのフック（既存）
            jsText = jsText.replace(/\blocation\.hostname\b/g, '__p_location.hostname')
                        .replace(/\blocation\.host\b/g, '__p_location.host')
                        .replace(/\blocation\.href\b/g, '__p_location.href')
                        .replace(/\blocation\.assign\b/g, '__p_location.assign')
                        .replace(/\blocation\.reload\b/g, '__p_location.reload');

            // 2. Web Worker / Shared Worker の絶対パス置換
            const host = req.headers.host;
            const protocol = req.protocol;
            const targetBaseOrigin = new URL(fetchUrl).origin;
            const encodedOrigin = encodeURL(targetBaseOrigin);
            
            // Worker または SharedWorker のコンストラクタを対象にする
            const workerRegex = /new\s+(Shared)?Worker\s*\((['"`])(.+?)\2\)/g;

            jsText = jsText.replace(workerRegex, (match, isShared, quote, path) => {
                // すでに処理済み、あるいはデータURL/Blob URLならスキップ
                if (path.includes('__p_origin') || path.startsWith('data:') || path.startsWith('blob:')) {
                    return match;
                }
                
                // 元の外部サーバー上の絶対URLを解決
                const absoluteExternalUrl = new URL(path, fetchUrl);
                
                // プロキシ（自サーバー）経由の絶対パスを組み立て
                // これにより <base> タグの影響を受けず、かつブラウザの Same-Origin 検証を通る
                const separator = absoluteExternalUrl.search ? '&' : '?';
                const proxiedPath = `${protocol}://${host}${absoluteExternalUrl.pathname}${absoluteExternalUrl.search}${separator}__p_origin=${encodedOrigin}`;
                
                const workerType = isShared ? 'SharedWorker' : 'Worker';
                return `new ${workerType}(${quote}${proxiedPath}${quote})`;
            });

            res.set('Content-Type', contentType);
            return res.send(jsText);
        }

        // --- HTML ---
        if (contentType.includes('text/html')) {
            const html = await response.text();

            // ログ出力（先頭 2000 文字だけ）
            // console.log(`--- HTML response from ${fetchUrl} ---\n`);
            // console.log(html.slice(0, 2000));
            // console.log('\n--- END OF HTML ---');

            const $ = cheerio.load(html);

            // --- inline <script> 内の location 書き換え ---
            $('script').each((_, el) => {
                // 外部JSは対象外
                if (el.attribs && el.attribs.src) return;

                if (!el.children || !el.children[0] || el.children[0].type !== 'text') return;

                let code = el.children[0].data;

                // location.xxx → __p_location.xxx
                code = code.replace(
                    /\blocation\.(href|host|hostname|origin|protocol|port|pathname|search|hash|reload)\b/g,
                    '__p_location.$1'
                );

                // assign / replace
                code = code.replace(
                    /\blocation\.(assign|replace)\b/g,
                    '__p_location.$1'
                );

                el.children[0].data = code;
            });

            const fullUrl = fetchUrl; // fetch に渡した URL が正しい
            $('body').attr('data-origin-url', fullUrl);
            const protocol = req.headers['x-forwarded-proto'] || req.protocol;
            const host = req.headers.host;
            let assetBase;
            // クエリに ppp_origin があればそれを使う。なければ自サーバーのパスを使う（正直いらない）
            if (req.query.ppp_origin) {
                assetBase = req.query.ppp_origin;
                // 末尾のスラッシュを削除して整形（任意）
                if (assetBase.endsWith('/')) assetBase = assetBase.slice(0, -1);
            } else {
                const protocol = req.headers['x-forwarded-proto'] || req.protocol;
                const host = req.headers.host;
                assetBase = `${protocol}://${host}/-assets`;
            }
            // アセット類を突っ込む
            $('head').prepend(`<script src="${assetBase}/js/main.js"></script>`);
            $('head').prepend(`<script src="${assetBase}/js/functions.js"></script>`);
            $('head').prepend(`<script src="${assetBase}/js/location-hook.js"></script>`);
            $('head').prepend(`<script src="${assetBase}/js/cookies-hook.js"></script>`);
            $('head').prepend(`<script src="${assetBase}/js/ppp-ui.js"></script>`);
            $('head').prepend(`<script src="${assetBase}/js/rewrite-dom.js"></script>`);
            $('head').prepend(`<script src="${assetBase}/js/t_r_a_c_k.js"></script>`);
            $('head').prepend(`<meta http-equiv="Content-Security-Policy" content="upgrade-insecure-requests">`);
            $('head').prepend(`<base __p_origin href="${fullUrl}">`);

            res.set('Content-Type', contentType);
            return res.send($.html());
        }

        // --- その他バイナリ ---
        const buffer = await response.buffer();
        res.set('Content-Type', contentType);
        return res.send(buffer);

    } catch (err) {
        next(err);
    }
});

// プロキシ用の静的ファイルを配信する
app.use('/-assets', express.static('public'));
// トップページの条件分岐
app.get('/', (req, res) => {
    const host = req.headers.host;
    if (host.includes('shirasagi-hs')) {
        // "shirasagi-hs"が含まれるなら
        res.sendFile(path.join(__dirname, '../public/html/other/shirasagi.html'));
    } else if (host.includes('kobekyo')) {
        // "kobekyo"が含まれるなら
        res.sendFile(path.join(__dirname, '../public/html/other/kobekyo.html'));
    } else {
        // 条件外ならonetime.htmlを返却
        res.sendFile(path.join(__dirname, '../public/html/other/onetime.html'));
    }
});
// プロキシメインページ
app.get('/p', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/html/index.html'));
});
app.get('/terms', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/html/terms.html'));
});
app.get('/privacy', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/html/privacy.html'));
});
// アップデートログを配信
app.get('/update', (req, res) => {
    res.type('text/plain');
    res.sendFile(path.join(__dirname, '../public/UPDATELOG.txt'));
});
// サービスワーカーを配信
app.get('/ServiceWorker.js', (req, res) => {
    res.set('Service-Worker-Allowed', '/');
    res.sendFile(path.join(__dirname, '../public/js/ServiceWorker.js'));
});
// ようつべ静的ルート
app.use('/youtube', express.static(path.join(__dirname, '../youtube')));

// --- static proxy（kobekyoで使用、ログイン不要） ---
app.use("/static-p/v1", staticProxyRouterV1);    // 通常
// [WARNING] 有効化してもいいですが慎重にお願いします。クラッシュしますよ。
// app.use("/static-p/v2", staticProxyRouterV2);    // CF回避可能
// app.use("/static-p/v3", staticProxyRouterV3);    // CF回避可能
app.use("/static-p/v4", staticProxyRouterV4);    // CF回避可能

// --- streaming proxy（youtube用、ログイン必須） ---
// [WARNING] 有効化してもいいですが慎重にお願いします。帯域があっという間になくなりますよ。 
// app.use("/streaming-p/v1", streamProxyRouterV1);

// ログイン画面を表示
app.get('/login', (req, res) => {
    const token = req.cookies.auth;
    if (token) {
        try {
            jwt.verify(token, process.env.JWT_SECRET);
            // すでにログイン済みの場合
            const redirectTo = req.query.re || '/p';
            return res.redirect(redirectTo);
        } catch {
            // トークンが壊れてる場合は削除
            res.clearCookie('auth');
        }
    }
    // 未ログインの場合はログイン画面を表示する
    res.sendFile(path.join(__dirname, '../public/html/login.html'));
});
// API: ログイン
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    if (
        username === process.env.LOGIN_USER &&
        password === process.env.LOGIN_PASS
    ) {
        const token = jwt.sign(
            { user: username },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.cookie('auth', token, {
            httpOnly: true,
            secure: true,
            sameSite: 'None',
            path: '/',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7日
        });

        return res.sendStatus(200);
    }

    res.sendStatus(401);
});

// エラーハンドリング
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, '../public/html/404.html'));
});
app.use((err, req, res, next) => {
    res.status(500).sendFile(path.join(__dirname, '../public/html/500.html'));
});

// サーバー起動
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Proxy server running at http://0.0.0.0:${PORT}`);
});


// --- 管理画面 ---
const http = require('http');
const { Server } = require('socket.io');

// ===== 管理用アプリ（io を先に作る） =====
const adminApp = express();
const adminServer = http.createServer(adminApp);
const io = new Server(adminServer);

// ログ保存（オブジェクト配列）
const accessLogs = [];

// pushLog はオブジェクトを受け取る（柔軟に対応）
function pushLog(entry) {
    // entry が文字列で来てしまった場合はフォールバックで構成
    let logObj;
    if (typeof entry === 'string') {
        // 可能なら簡易パース（安全策）
        logObj = { raw: entry, time: new Date().toISOString() };
    } else if (typeof entry === 'object' && entry !== null) {
        logObj = {
            time: entry.time || new Date().toISOString(),
            ip: entry.ip || entry.remote || '-',
            method: entry.method || '-',
            status: typeof entry.status === 'number'
                ? entry.status
                : (entry.status || '-'),
            url: entry.url || entry.path || '-',
            duration: typeof entry.duration === 'number'
                ? entry.duration
                : Number(entry.duration),
            ...(entry.meta && { meta: entry.meta })
        };

    } else {
        logObj = { raw: String(entry), time: new Date().toISOString() };
    }

    accessLogs.push(logObj);
    if (accessLogs.length > 1000) accessLogs.shift();

    // Console には読みやすい文字列で出力
    const consoleLine = `[${logObj.time}] ${logObj.ip} ${logObj.method} ${logObj.status} ${logObj.url}`;
    // console.log(consoleLine);

    // Socket.io でオブジェクトを送る
    try {
        io.emit('log', logObj);
    } catch (e) {
        // io が未初期化でも安全に
        console.error('io.emit failed', e);
    }
}

adminApp.get("/", (req, res) => {
  res.redirect("/dashboard");
});
adminApp.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, "../admin/public/index.html"));
});
adminApp.get('/dashboard/access', (req, res) => {
    res.sendFile(path.join(__dirname, "../admin/public/preview.html"));
});
adminApp.get('/dashboard/fetch', (req, res) => {
    res.sendFile(path.join(__dirname, "../admin/public/fetchlog.html"));
});
adminApp.get("/api/dashboard/access", (req, res) => {
  fs.readFile(logPath, "utf8", (err, data) => {
    if (err) return res.json([]);

    const lines = data.split("\n").filter(Boolean);
    const logs = lines.map(line => {
      try { return JSON.parse(line); }
      catch { return null; }
    }).filter(Boolean);

    res.json(logs.slice(-1000));
  });
});
adminApp.get("/api/dashboard/view", (req, res) => {
  fs.readFile(trackPath, "utf8", (err, data) => {
    if (err) return res.json([]);

    const lines = data.split("\n").filter(Boolean);

    res.json(lines);
  });
});
// Socket接続時
io.on('connection', socket => {
    // 初期データ送信（accessLogs はオブジェクト配列）
    socket.emit('init', accessLogs);

    // クライアント数ブロードキャスト
    const clients = io.engine.clientsCount || 0;
    io.emit('clients', clients);

    // クライアントからログクリア要求が来たらサーバー側配列をクリア
    socket.on('clearLogs', () => {
        accessLogs.length = 0;
        io.emit('clients', io.engine.clientsCount || 0);
    });

    socket.on('disconnect', () => {
        io.emit('clients', io.engine.clientsCount || 0);
    });
});

// ランダムポート起動
adminServer.listen(0, '0.0.0.0', () => {
    const { port } = adminServer.address();
    console.log(`Admin console running at http://localhost:${port}`);
});

