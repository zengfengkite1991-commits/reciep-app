const CACHE_NAME = 'recipe-app-v2';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/manifest.json'
];

// CDN资源使用单独缓存
const CDN_CACHE_NAME = 'recipe-cdn-v1';
const CDN_ASSETS = [
    'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
];

// 安装时缓存
self.addEventListener('install', (e) => {
    e.waitUntil(
        Promise.all([
            caches.open(CACHE_NAME).then(cache => {
                console.log('缓存静态资源...');
                return cache.addAll(STATIC_ASSETS);
            }),
            caches.open(CDN_CACHE_NAME).then(cache => {
                return Promise.all(
                    CDN_ASSETS.map(url => 
                        fetch(url, { mode: 'no-cors' })
                            .then(response => cache.put(url, response))
                            .catch(err => console.warn('CDN缓存失败:', url, err))
                    )
                );
            })
        ]).catch(err => console.error('安装缓存失败:', err))
    );
    self.skipWaiting();
});

// 激活时清理旧缓存
self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames
                    .filter(name => name !== CACHE_NAME && name !== CDN_CACHE_NAME)
                    .map(name => {
                        console.log('删除旧缓存:', name);
                        return caches.delete(name);
                    })
            );
        })
    );
    self.clients.claim();
});

// 智能缓存策略
self.addEventListener('fetch', (e) => {
    const { request } = e;
    const url = new URL(request.url);

    // 策略1：导航请求 - 网络优先，快速回退缓存
    if (request.mode === 'navigate') {
        e.respondWith(
            fetch(request)
                .catch(() => caches.match('/index.html'))
        );
        return;
    }

    // 策略2：CDN资源 - 缓存优先
    if (CDN_ASSETS.some(cdnUrl => url.href.includes(cdnUrl))) {
        e.respondWith(
            caches.match(request).then(response => {
                return response || fetch(request).catch(() => {
                    return new Response('资源加载失败，请检查网络', {
                        status: 503,
                        headers: { 'Content-Type': 'text/plain' }
                    });
                });
            })
        );
        return;
    }

    // 策略3：图片资源 - 缓存优先，后台更新
    if (request.destination === 'image') {
        e.respondWith(
            caches.match(request).then(cached => {
                const fetchPromise = fetch(request)
                    .then(networkResponse => {
                        if (networkResponse.ok) {
                            const clone = networkResponse.clone();
                            caches.open(CACHE_NAME).then(cache => {
                                cache.put(request, clone);
                            });
                        }
                        return networkResponse;
                    })
                    .catch(() => cached || new Response('', { status: 404 }));

                return cached || fetchPromise;
            })
        );
        return;
    }

    // 策略4：其他资源 - 网络优先，缓存回退
    e.respondWith(
        fetch(request)
            .then(response => {
                if (response.ok && request.method === 'GET') {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(request, clone);
                    });
                }
                return response;
            })
            .catch(() => {
                return caches.match(request).then(cached => {
                    if (cached) return cached;
                    if (request.destination === 'document') {
                        return caches.match('/index.html');
                    }
                    return new Response('离线模式：资源不可用', { status: 503 });
                });
            })
    );
});
