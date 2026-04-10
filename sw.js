const CACHE_NAME = 'recipe-app-v1';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/manifest.json',
    'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
];

// 安装时缓存静态资源
self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('缓存静态资源...');
                return cache.addAll(STATIC_ASSETS);
            })
            .catch(err => console.error('缓存失败:', err))
    );
    self.skipWaiting();
});

// 激活时清理旧缓存
self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames
                    .filter(name => name !== CACHE_NAME)
                    .map(name => caches.delete(name))
            );
        })
    );
    self.clients.claim();
});

// 优化的缓存策略：缓存优先，网络回退
self.addEventListener('fetch', (e) => {
    // 跳过非GET请求和chrome扩展
    if (e.request.method !== 'GET' || e.request.url.startsWith('chrome-extension')) {
        return;
    }

    e.respondWith(
        caches.match(e.request).then(cached => {
            // 返回缓存或发起网络请求
            const fetchPromise = fetch(e.request)
                .then(networkResponse => {
                    // 更新缓存
                    if (networkResponse && networkResponse.status === 200) {
                        const clone = networkResponse.clone();
                        caches.open(CACHE_NAME).then(cache => {
                            cache.put(e.request, clone);
                        });
                    }
                    return networkResponse;
                })
                .catch(() => cached); // 网络失败时返回缓存

            return cached || fetchPromise;
        })
    );
});
