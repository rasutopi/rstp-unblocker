document.addEventListener('DOMContentLoaded', () => {
    // --- 要素の取得 ---
    const elements = {
        container: document.getElementById('player-container'),
        video: document.getElementById('video-player'),
        audio: document.getElementById('audio-player'),
        playBtn: document.getElementById('play-btn'),
        volBtn: document.getElementById('vol-btn'),
        volSlider: document.getElementById('volume-slider'),
        currentTime: document.getElementById('current-time'),
        durationTime: document.getElementById('duration-time'),
        progressBar: document.getElementById('progress-bar'),
        bufferBar: document.getElementById('buffer-bar'),
        timeline: document.getElementById('timeline'),
        spinner: document.getElementById('spinner'),
        controls: document.getElementById('controls'),
        fsBtn: document.getElementById('fs-btn'),
        labels: {
            left: document.getElementById('label-left'),
            right: document.getElementById('label-right')
        },
        meta: {
            title: document.getElementById('video-title'),
            authorIcon: document.getElementById('author-icon'),
            authorThumb: document.getElementById('author-thumb'),
            authorInitial: document.getElementById('author-initial'),
            authorName: document.getElementById('author-name'),
            subCount: document.getElementById('subscriber-count'),
            viewCount: document.getElementById('view-count'),
            pubDate: document.getElementById('publish-date'),
            desc: document.getElementById('video-description'),
            descContainer: document.getElementById('desc-container'),
            showMoreBtn: document.getElementById('show-more'),
            comments: document.getElementById('comments-container'),
            related: document.getElementById('related-list')
        }
    };

    // --- 設定・状態 ---
    const GAS_PROXY_URL = 'https://script.google.com/macros/s/AKfycbx3O6o45fLmYof8cbFplrZGSfvpmCVkVScUcl6pcPJiCuXEj_VKgg1WBj--OwaeezNKNQ/exec';
    let isDragging = false;
    let controlsTimeout;
    let isDescriptionExpanded = false;

    // --- メイン初期化処理 ---
    const urlParams = new URLSearchParams(window.location.search);
    const videoId = urlParams.get('v') || 'dQw4w9WgXcQ'; // デフォルトID
    
    // 検索機能の初期化
    window.handleSearch = () => {
        const query = document.getElementById('search-input').value;
        if (query) {
            // queryをURLエンコードして、/search.html?q= 形式で遷移
            window.location.href = `/youtube/search.html?q=${encodeURIComponent(query)}`;
        }
    };
    initPlayer();
    loadVideoData(videoId);

    // --- プレイヤーロジック ---

    function initPlayer() {
        const { video, audio, playBtn, volBtn, volSlider, timeline, container, fsBtn } = elements;
        
        audio.setAttribute('playsinline', '');
        video.muted = true; // 映像は常にミュート
        video.playsInline = true; // iOS対応

        // --- 1. 再生制御：Audioを「親」、Videoを「子」とする ---

        // 再生・停止の切り替え（ユーザー操作の入り口）
        const togglePlay = () => {
            if (audio.paused || audio.ended) {
                audio.play().catch(e => console.error("Audio play error", e));
            } else {
                audio.pause();
            }
        };
        
        playBtn.addEventListener('click', togglePlay);
        video.addEventListener('click', togglePlay);

        // --- 重要：Audioのイベントを「正」として扱う ---
        
        // 音声が再生されたら -> 映像も再生し、ボタンを変える
        audio.addEventListener('play', () => {
            video.play().catch(e => console.warn("Video play blocked (Background?)", e));
            updatePlayButton(true);
            container.classList.remove('paused');
            hideSpinner();
        });

        // 音声が停止されたら -> 映像も止め、ボタンを変える
        audio.addEventListener('pause', () => {
            // ユーザーが意図して止めた場合のみ映像も止める
            video.pause();
            updatePlayButton(false);
            container.classList.add('paused');
        });

        // 音声が読み込み待ちになったら -> スピナーを出す
        audio.addEventListener('waiting', showSpinner);
        audio.addEventListener('playing', hideSpinner);

        // シーク時の同期
        audio.addEventListener('seeking', () => {
             video.currentTime = audio.currentTime;
             showSpinner();
        });
        audio.addEventListener('seeked', hideSpinner);

        // --- Videoのイベントは「従」なので、Audioを操作しない ---
        // ここが最大の修正点です。videoがpauseしてもaudioは止めません。

        video.addEventListener('waiting', () => {
            // 映像がバッファで止まっても、音声は止めない（バックグラウンド再生のため）
            showSpinner();
        });

        video.addEventListener('playing', () => {
            hideSpinner();
            // 映像が復活したら同期チェック
            if (Math.abs(audio.currentTime - video.currentTime) > 0.5) {
                video.currentTime = audio.currentTime;
            }
        });

        // --- ズレ補正とバックグラウンド復帰 (強力版) ---
        setInterval(() => {
            // 音声が再生中なのに、映像が止まっている、またはズレている場合
            if (!audio.paused) {
                const diff = Math.abs(audio.currentTime - video.currentTime);
                
                // 1. 映像が止まっていたら無理やり再生（バックグラウンドからの復帰時など）
                if (video.paused) {
                    video.play().catch(() => {});
                    // 映像位置を音声に合わせる
                    video.currentTime = audio.currentTime;
                }
                // 2. ズレが0.3秒以上なら強制同期
                else if (diff > 0.3) {
                    console.log(`Syncing... Diff: ${diff}`);
                    video.currentTime = audio.currentTime;
                }
            }
        }, 1000);

        // 2. 音量制御
        const updateVolume = () => {
            const val = parseFloat(volSlider.value);
            audio.volume = val;
            audio.muted = (val === 0);
            
            if (val === 0) {
                volBtn.innerHTML = '<i class="material-icons">volume_off</i>';
            } else if (val < 0.5) {
                volBtn.innerHTML = '<i class="material-icons">volume_down</i>';
            } else {
                volBtn.innerHTML = '<i class="material-icons">volume_up</i>';
            }
        };

        volSlider.addEventListener('input', updateVolume);
        volBtn.addEventListener('click', () => {
            if (audio.muted || audio.volume === 0) {
                audio.muted = false;
                audio.volume = 1;
                volSlider.value = 1;
            } else {
                audio.muted = true;
                audio.volume = 0;
                volSlider.value = 0;
            }
            updateVolume();
        });

        // 3. タイムライン・プログレスバー
        // Audioの時間を正としてUIを更新する
        audio.addEventListener('timeupdate', () => {
            if (!isDragging) {
                updateProgressUI(audio.currentTime, audio.duration);
            }
        });
        
        // DurationはVideoのメタデータが正確なことが多いが、Audioを優先しても良い
        // ここでは念のため両方監視し、長い方を採用（ストリームの性質による）
        const setDuration = () => {
            const d = Math.max(video.duration || 0, audio.duration || 0);
            if(d > 0) elements.durationTime.textContent = formatTime(d);
        };
        video.addEventListener('loadedmetadata', setDuration);
        audio.addEventListener('loadedmetadata', setDuration);

        video.addEventListener('progress', updateBufferBar);

        // ドラッグ操作
        const startDrag = (e) => {
            isDragging = true;
            container.classList.add('dragging');
            handleDrag(e);
        };
        const endDrag = (e) => {
            if (isDragging) {
                handleDrag(e);
                isDragging = false;
                container.classList.remove('dragging');
                
                // シーク実行（Audioを動かす）
                const rect = timeline.getBoundingClientRect();
                const x = (e.clientX || e.changedTouches[0].clientX) - rect.left;
                const pos = Math.max(0, Math.min(1, x / rect.width));
                const duration = Math.max(video.duration || 0, audio.duration || 0);
                
                audio.currentTime = pos * duration;
                video.currentTime = audio.currentTime; // 映像も合わせておく
            }
        };
        const handleDrag = (e) => {
            if (!isDragging) return;
            e.preventDefault();
            const clientX = e.clientX || e.touches[0].clientX;
            const rect = timeline.getBoundingClientRect();
            const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
            const duration = Math.max(video.duration || 0, audio.duration || 0);
            
            elements.progressBar.style.width = `${pos * 100}%`;
            elements.currentTime.textContent = formatTime(pos * duration);
        };

        timeline.addEventListener('mousedown', startDrag);
        timeline.addEventListener('touchstart', startDrag, { passive: false });
        document.addEventListener('mousemove', handleDrag);
        document.addEventListener('touchmove', handleDrag, { passive: false });
        document.addEventListener('mouseup', endDrag);
        document.addEventListener('touchend', endDrag);

        // 4. フルスクリーン
        fsBtn.addEventListener('click', () => {
            if (!document.fullscreenElement) {
                container.requestFullscreen().catch(err => console.log(err));
            } else {
                document.exitFullscreen();
            }
        });
        document.addEventListener('fullscreenchange', () => {
            fsBtn.innerHTML = document.fullscreenElement 
                ? '<i class="material-icons">fullscreen_exit</i>' 
                : '<i class="material-icons">fullscreen</i>';
        });

        // 5. ホバー制御
        container.addEventListener('mousemove', () => showControls());
        container.addEventListener('mouseleave', () => {
            if (!audio.paused) hideControls(); // audio基準に変更
        });

        // 6. ショートカット
        document.addEventListener('keydown', (e) => {
            if (document.activeElement.tagName === 'INPUT') return;
            switch(e.key.toLowerCase()) {
                case ' ':
                case 'k': e.preventDefault(); togglePlay(); break;
                case 'f': e.preventDefault(); fsBtn.click(); break;
                case 'arrowright': 
                case 'l': e.preventDefault(); skip(10); break;
                case 'arrowleft': 
                case 'j': e.preventDefault(); skip(-10); break;
                case 'm': volBtn.click(); break;
            }
        });
    }
    // --- データ読み込みロジック (GAS API) ---

    async function loadVideoData(vId) {
        showSpinner();
        elements.meta.title.textContent = "読み込み中...";
        
        try {
            // パラメータ作成
            const paramsVideo = new URLSearchParams({ video: vId });
            const paramsStream = new URLSearchParams({ stream2: vId });
            const paramsComments = new URLSearchParams({ comments: vId });
            const paramsRelated = new URLSearchParams({ related: vId });

            // 1. メタデータとストリーム情報の取得 (並列)
            const [metaRes, streamRes] = await Promise.all([
                fetch(`${GAS_PROXY_URL}?${paramsVideo}`),
                fetch(`${GAS_PROXY_URL}?${paramsStream}`)
            ]);

            if(!metaRes.ok || !streamRes.ok) throw new Error("API Error");

            const meta = await metaRes.json();
const stream = await streamRes.json();
            console.log("GAS Response:", stream); // 確認用

            // 利用可能な画質を優先順位順に定義
            const qualityOrder = ['1080p', '720p', '480p', '360p', '240p', '144p'];
            let vUrl = null;
            let aUrl = null;

            // videourlオブジェクトの中から、利用可能な最高の画質を探す
            for (const q of qualityOrder) {
                if (stream.videourl[q]) {
                    // ストリーミングを中継器にかける
                    const wrap = (url) =>
                      `/streaming-p/r?url=${encodeURIComponent(url)}`;
                    vUrl = wrap(stream.videourl[q].video.url);
                    aUrl = wrap(stream.videourl[q].audio.url);
                    
                    console.log(`Selected Quality: ${q}`);
                    break; 
                }
            }

            // 万が一見つからなかった場合のフォールバック（最初の画質を取得）
            if (!vUrl) {
                const firstQuality = Object.values(stream.videourl)[0];
                if (firstQuality) {
                    vUrl = firstQuality.video.url;
                    aUrl = firstQuality.audio.url;
                }
            }

            if (vUrl && aUrl) {
                elements.video.src = vUrl;
                elements.audio.src = aUrl;
                elements.video.load();
                elements.audio.load();
            } else {
                throw new Error("再生可能なURLが見つかりませんでした。");
            }
            // 2. コメントと関連動画 (非同期で遅延読み込み)
            loadComments(vId);
            loadRelated(vId);

        } catch (error) {
            console.error(error);
            elements.meta.title.textContent = "動画の読み込みに失敗しました";
            hideSpinner();
        }
    }

function renderMetadata(data) {
        const { meta } = elements;
        
        // タイトル
        meta.title.textContent = data.title || "No Title";
        document.title = `${data.title || 'Video'} - Video Player`;
        
        // --- 修正箇所: 著者名（チャンネル名）の安全な取得 ---
        let authorName = "不明";
        if (typeof data.author === 'string') {
            // 文字列ならそのまま使う
            authorName = data.author;
        } else if (data.author && typeof data.author === 'object') {
            // オブジェクトなら .name プロパティなどを探す
            authorName = data.author.name || data.author.user || "不明";
        }
        
        meta.authorName.textContent = authorName;
        // ---------------------------------------------------

        meta.subCount.textContent = "チャンネル登録者数 ??人"; 

        // アイコン画像がある場合
        if (data.authorIcon) {
            meta.authorThumb.src = data.authorIcon;
            meta.authorThumb.classList.remove('hidden');
            meta.authorInitial.classList.add('hidden');
        } else {
            // 画像がない場合はイニシャルを表示（安全にアクセス）
            meta.authorThumb.classList.add('hidden');
            meta.authorInitial.classList.remove('hidden');
            meta.authorInitial.textContent = authorName.charAt(0).toUpperCase();
        }

        // 概要欄
        meta.viewCount.textContent = formatNumber(data.views);
        meta.pubDate.textContent = data.published || "日付不明";
        
        // 説明文
        meta.desc.textContent = data.description || "説明なし";
        
        // 「もっと見る」ボタンの制御
        setupDescriptionToggle();
    }
    async function loadComments(vId) {
        try {
            const res = await fetch(`${GAS_PROXY_URL}?comments=${vId}`);
            const data = await res.json();
            
            const list = data.comments || [];
            if (list.length === 0) {
                elements.meta.comments.innerHTML = '<p class="text-gray-400">コメントはありません</p>';
                return;
            }

            elements.meta.comments.innerHTML = list.map(c => `
                <div class="flex gap-3 text-sm">
                    <div class="w-10 h-10 rounded-full bg-gray-600 flex-shrink-0 overflow-hidden">
                        <img src="${c.authorThumb || ''}" onerror="this.style.display='none'" class="w-full h-full object-cover">
                    </div>
                    <div class="flex-1">
                        <div class="flex items-center gap-2 mb-1">
                            <span class="font-bold text-white text-xs">${escapeHtml(c.author)}</span>
                            <span class="text-gray-400 text-xs">${c.time || ''}</span>
                        </div>
                        <p class="text-gray-200 leading-snug">${escapeHtml(c.text)}</p>
                        <div class="flex items-center gap-4 mt-2 text-gray-400">
                            <div class="flex items-center gap-1 cursor-pointer hover:text-white">
                                <i class="material-icons" style="font-size:16px">thumb_up</i>
                                <span class="text-xs">${c.likes || 0}</span>
                            </div>
                        </div>
                    </div>
                </div>
            `).join('');
        } catch (e) {
            elements.meta.comments.innerHTML = '<p class="text-gray-400">コメントの読み込みに失敗</p>';
        }
    }

    async function loadRelated(vId) {
        try {
            const res = await fetch(`${GAS_PROXY_URL}?related=${vId}`);
            const data = await res.json();
            const list = data.related || [];
            
            elements.meta.related.innerHTML = list.map(v => `
                <a href="?v=${v.id}" class="flex gap-2 group cursor-pointer">
                    <div class="relative w-40 h-24 flex-shrink-0 rounded-lg overflow-hidden bg-gray-800">
                        <img src="${v.thumbnail}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" loading="lazy">
                        <span class="absolute bottom-1 right-1 bg-black bg-opacity-80 text-white text-xs px-1 rounded">${v.duration || ''}</span>
                    </div>
                    <div class="flex flex-col gap-1 min-w-0">
                        <h4 class="font-bold text-sm leading-tight line-clamp-2 group-hover:text-gray-300 text-white">${escapeHtml(v.title)}</h4>
                        <p class="text-xs text-gray-400">${escapeHtml(v.author)}</p>
                        <p class="text-xs text-gray-400">${formatNumber(v.views)} 回視聴</p>
                    </div>
                </a>
            `).join('');
        } catch (e) {
            elements.meta.related.innerHTML = '<p class="text-gray-400 text-sm">関連動画なし</p>';
        }
    }

    // --- ヘルパー関数 & UIロジック ---

    function syncAudio() {
        // 許容誤差内なら合わせない
        if (Math.abs(elements.audio.currentTime - elements.video.currentTime) > 0.1) {
            elements.audio.currentTime = elements.video.currentTime;
        }
    }

    function skip(seconds) {
        const { video, labels } = elements;
        video.currentTime += seconds;
        
        // アニメーション表示
        const label = seconds > 0 ? labels.right : labels.left;
        label.style.display = 'flex';
        // CSS AnimationをリセットするためにClone Node等のテクニックが必要だが、
        // ここではdisplay切り替えのみで簡易実装 (CSSの @keyframes fadeOut に依存)
        label.style.animation = 'none';
        label.offsetHeight; /* trigger reflow */
        label.style.animation = 'fadeOut 0.6s forwards';
        
        setTimeout(() => {
            // label.style.display = 'none'; // animationendで消える想定なら不要だが安全策
        }, 600);
    }

    function updateProgressUI(current, duration) {
        if (!duration) return;
        const percent = (current / duration) * 100;
        elements.progressBar.style.width = `${percent}%`;
        elements.currentTime.textContent = formatTime(current);
    }

    function updateBufferBar() {
        const { video, bufferBar } = elements;
        if (video.buffered.length > 0) {
            // 現在の再生位置が含まれるバッファ範囲を探す
            for (let i = 0; i < video.buffered.length; i++) {
                if (video.buffered.start(i) <= video.currentTime && video.buffered.end(i) >= video.currentTime) {
                    const end = video.buffered.end(i);
                    const width = (end / video.duration) * 100;
                    bufferBar.style.width = `${width}%`;
                    return;
                }
            }
        }
    }

    function showControls() {
        elements.controls.style.opacity = '1';
        elements.container.style.cursor = 'default';
        clearTimeout(controlsTimeout);
        controlsTimeout = setTimeout(() => {
            if (!elements.video.paused) hideControls();
        }, 3000);
    }

    function hideControls() {
        elements.controls.style.opacity = '0';
        elements.container.style.cursor = 'none';
    }

    function updatePlayButton(isPlaying) {
        elements.playBtn.innerHTML = isPlaying 
            ? '<i class="material-icons">pause</i>' 
            : '<i class="material-icons">play_arrow</i>';
    }

    function showSpinner() {
        elements.spinner.style.display = 'block';
    }
    
    function hideSpinner() {
        elements.spinner.style.display = 'none';
    }

    function setupDescriptionToggle() {
        const { desc, descContainer, showMoreBtn } = elements.meta;
        showMoreBtn.onclick = (e) => {
            e.stopPropagation();
            isDescriptionExpanded = !isDescriptionExpanded;
            if (isDescriptionExpanded) {
                desc.style.maxHeight = 'none';
                showMoreBtn.textContent = '一部を表示';
            } else {
                desc.style.maxHeight = '6rem'; // max-h-24 (96px) approx
                showMoreBtn.textContent = '...もっと見る';
            }
        };
        // ボックス全体をクリックしても開閉するようにする場合
        descContainer.onclick = () => {
             if(!isDescriptionExpanded) showMoreBtn.click();
        };
    }

    // 数値フォーマット (1,234 回視聴)
    function formatNumber(num) {
        if (!num) return "0";
        // 日本語形式の万・億対応をする場合はここにロジックを追加
        // ここではカンマ区切りのみ
        return Number(num).toLocaleString();
    }

    // 時間フォーマット (MM:SS)
    function formatTime(seconds) {
        if (!seconds || isNaN(seconds)) return "0:00";
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        
        const mm = m < 10 && h > 0 ? `0${m}` : m;
        const ss = s < 10 ? `0${s}` : s;
        
        return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
    }

    // XSS対策
    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/[&<>"']/g, function(m) {
            return {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#039;'
            }[m];
        });
    }
});
