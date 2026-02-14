// ============================
// メインJS
// Copyright 2026 Team xxxxxxxw
// ============================

// ORIGINを宣言
const ORIGIN = window.location.origin;

// - - - サービスワーカー登録 - - -
if ('serviceWorker' in navigator) {
    const swPath = window.location.origin + '/ServiceWorker.js';

    // 1. 即座に登録開始 (loadを待たない)
    navigator.serviceWorker.register(swPath)
    .then(async registration => {
        console.log('Service Worker 登録成功');

        // 2. SWがこのページを「支配(control)」するまで待つ
        if (!navigator.serviceWorker.controller) {
            await new Promise(resolve => {
                navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true });
            });
        }
        
        // 3. ここで初めて Worker 起動用のカスタムイベントを飛ばすか、関数を呼ぶ
        console.log('✅ SW準備完了！Workerを起動できます');
        window.dispatchEvent(new CustomEvent('sw-ready'));
    });
}// - - - サービスワーカー登録 - - -
