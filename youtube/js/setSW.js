/**
 * setSW.js
 * /youtube パスの場合のみサービスワーカーを解除する
 */
(function() {
  if ('serviceWorker' in navigator) {
    const currentPath = window.location.pathname;

    // URLの先頭が /youtube で始まる場合（例: /youtube, /youtube/video123）
    if (currentPath.startsWith('/youtube')) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        if (registrations.length > 0) {
          for (const registration of registrations) {
            registration.unregister();
            console.log('[/youtube] Service Worker has been unregistered.');
          }
          // 解除を反映させるためにページをリロードする必要がある場合があります
          // window.location.reload(); 
        }
      });

      // YouTube関連で溜まったキャッシュも削除したい場合は以下を有効化
      /*
      if (window.caches) {
        caches.keys().then((names) => {
          for (const name of names) {
            caches.delete(name);
          }
        });
      }
      */
    } else {
      console.log('Service Worker is active for this path:', currentPath);
    }
  }
})();
