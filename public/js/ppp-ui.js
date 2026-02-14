// ============================
// プロキシ用UI
// Copyright 2026 Team xxxxxxx
// ============================

// body がまだ無ければ待つ
if (!document.body) {
    document.addEventListener('DOMContentLoaded', initUIWrapper);
} else {
    initUIWrapper();
}

function initUIWrapper() {
    // 元のUI初期化関数（既存コード）を呼ぶ
    initUI(); // ←ここは既存コードで定義済みのUI初期化関数名に置き換えてOK

    const container = document.getElementById('anony-ui-container');
    if (!container) return;

    // 念のため固定スタイルを再設定
    container.style.position = 'fixed';
    container.style.top = '0';
    container.style.left = '0';
    container.style.zIndex = '999999';

    // ページ差し替えや消失に備えて監視
    new MutationObserver(() => {
        if (!document.getElementById('anony-ui-container')) {
            initUIWrapper(); // 消えたら再生成
        }
    }).observe(document.documentElement, { childList: true, subtree: true });
}

function initUI() {
    const HEADER_HEIGHT = 60;

    // LocalStorage ヘルパー
    const setUIState = (name, value) => {
        try { localStorage.setItem(name, value); } catch {}
    };
    const getUIState = (name) => {
        try { return localStorage.getItem(name); } catch { return null; }
    };

    // Shadow DOMコンテナ作成
    const container = document.createElement('div');
    container.id = 'anony-ui-container';
    document.body.prepend(container);
    const shadow = container.attachShadow({ mode: 'open' });

    const ORIGIN = window.location.origin

    shadow.innerHTML = `
        <style>
            #-header {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: ${HEADER_HEIGHT}px;
                background: #fff;
                color: #222;
                display: flex;
                align-items: center;
                padding: 0 10px;
                font-family: sans-serif;
                font-size: 14px;
                z-index: 999999;
                box-shadow: 0 2px 5px rgba(0,0,0,0.2);
                box-sizing: border-box;
                flex-wrap: nowrap;
                gap: 5px;
            }
            #-header img {
                height: 28px;
                width: 28px;
            }
            #-header .title {
                font-weight: bold;
                margin-left: 5px;
                white-space: nowrap;
            }
            #-header input[type="text"] {
                flex: 1 1 120px;
                min-width: 80px;
                padding: 5px 6px;
                border-radius: 4px;
                border: 1px solid #ccc;
                font-size: 13px;
            }
            #-header button {
                background: #06c;
                color: #fff;
                border: none;
                border-radius: 4px;
                padding: 5px 8px;
                cursor: pointer;
                font-size: 12px;
                white-space: nowrap;
            }
            #-header button:hover { background: #048; }

            #show-ui-btn {
                position: fixed;
                top: 10px;
                right: 10px;
                z-index: 999999;
                width: 36px;
                height: 36px;
                background: url('${ORIGIN}/-assets/img/Icon512x512.png') no-repeat center/cover;
                border: none;
                opacity: 0.25;
                transition: opacity 0.25s;
                cursor: pointer;
                display: none;
            }
            #show-ui-btn:hover {
                opacity: 1.0;
            }

            @media (max-width: 480px) {
                #-header {
                    font-size: 12px;
                    padding: 0 5px;
                }
                #-header input[type="text"] {
                    flex: 1 1 60px;
                    font-size: 12px;
                }
                #-header button {
                    padding: 4px 6px;
                    font-size: 11px;
                }
                #-header .title {
                    font-size: 13px;
                }
            }
        </style>

        <div id="-header">
            <a href="${ORIGIN}/p" id="-home" style="display:flex; align-items:center; text-decoration:none; color:inherit;">
                <img src="${ORIGIN}/-assets/img/Icon512x512.png" alt="Icon" />
                <div class="title">Web</div>
            </a>
            <input type="text" id="-url" placeholder="URLを入力" />
            <button id="go-btn">移動</button>
            <button id="close-ui">閉じる</button>
        </div>

        <button id="show-ui-btn"></button>
    `;

    const headerEl = shadow.getElementById('-header');
    const closeBtn = shadow.getElementById('close-ui');
    const showBtn = shadow.getElementById('show-ui-btn');
    const inputEl = shadow.getElementById('-url');

    // ヘッダー色自動判定
    const adjustHeaderColor = () => {
        const bodyBg = getComputedStyle(document.body).backgroundColor;
        const rgb = bodyBg.match(/\d+/g)?.map(Number) || [255, 255, 255];
        const brightness = (rgb[0] + rgb[1] + rgb[2]) / 3;

        if (brightness < 128) {
            headerEl.style.background = '#333';
            headerEl.style.color = '#fff';
            shadow.querySelectorAll('input[type="text"]').forEach(el => {
                el.style.background = '#555';
                el.style.color = '#fff';
                el.style.border = '1px solid #888';
            });
        } else {
            headerEl.style.background = '#fff';
            headerEl.style.color = '#222';
            shadow.querySelectorAll('input[type="text"]').forEach(el => {
                el.style.background = '#fff';
                el.style.color = '#000';
                el.style.border = '1px solid #ccc';
            });
        }
    };

    adjustHeaderColor();
    const observer = new MutationObserver(adjustHeaderColor);
    observer.observe(document.body, { attributes: true, attributeFilter: ['style', 'class'] });

    // 現在のページURL（元URLを優先）
    inputEl.value = document.body.dataset.originUrl || window.location.href;

    // UI状態を localStorage から取得
    const uiState = getUIState('anonyUIState'); // 'open' or 'closed'
    if (uiState === 'closed') {
        headerEl.style.display = 'none';
        showBtn.style.display = 'block';
    } else {
        headerEl.style.display = 'flex';
        showBtn.style.display = 'none';
    }

    // 閉じる・再表示
    closeBtn.addEventListener('click', () => {
        headerEl.style.display = 'none';
        showBtn.style.display = 'block';
        setUIState('anonyUIState', 'closed');
    });
    showBtn.addEventListener('click', () => {
        headerEl.style.display = 'flex';
        showBtn.style.display = 'none';
        setUIState('anonyUIState', 'open');
    });

    // 移動ボタン
    const go = () => {
        const inputUrl = inputEl.value.trim();
        console.log('入力値:', inputUrl);

        if (!inputUrl) return;

        // 外部ファイルの関数 makeProxiedUrl を呼び出す
        // ORIGINは関数内で自動生成されるため、第2引数は省略可能です
        const newUrl = makeProxiedUrl(inputUrl);

        if (newUrl) {
            console.log('最終URL:', newUrl);
            window.location.href = newUrl;
            console.log('遷移処理実行');
        } else {
            // 関数が null を返した（URLが無効だった）場合の処理
            console.error('URL変換に失敗しました');
            alert('URLが無効です。正しく入力されているか確認してください。');
        }
    };
    
    const goBtn = shadow.getElementById('go-btn');
    goBtn.addEventListener('click', go); // ←ここで go() を紐付け

    inputEl.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') shadow.getElementById('go-btn').click();
    });
};
