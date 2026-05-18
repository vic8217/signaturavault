const CACHE_VERSION = 'signatura-v2';
const ASSETS_TO_CACHE = [
	'/',
	'/manifest.json',
	'/offline.html',
	'/signatura-logo.png',
];

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches.open(CACHE_VERSION).then((cache) => {
			return cache.addAll(ASSETS_TO_CACHE).catch(() => {
				console.log(
					'Cache addAll error - some assets may not be available offline',
				);
			});
		}),
	);
	self.skipWaiting();
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches.keys().then((cacheNames) => {
			return Promise.all(
				cacheNames
					.filter((name) => name !== CACHE_VERSION)
					.map((name) => caches.delete(name)),
			);
		}),
	);
	self.clients.claim();
});

self.addEventListener('fetch', (event) => {
	const { request } = event;
	const url = new URL(request.url);

	if (url.protocol !== 'http:' && url.protocol !== 'https:') {
		return;
	}

	if (request.method !== 'GET') {
		return;
	}

	if (request.mode === 'navigate') {
		event.respondWith(
			fetch(request)
				.then((response) => {
					const responseClone = response.clone();
					caches.open(CACHE_VERSION).then((cache) => {
						cache.put(request, responseClone);
					});
					return response;
				})
				.catch(() => {
					return caches.match(request).then((response) => {
						return response || caches.match('/offline.html');
					});
				}),
		);
		return;
	}

	event.respondWith(
		caches.match(request).then((cachedResponse) => {
			const networkResponse = fetch(request)
				.then((response) => {
					const responseClone = response.clone();
					caches.open(CACHE_VERSION).then((cache) => {
						cache.put(request, responseClone);
					});
					return response;
				})
				.catch(() => cachedResponse);

			return cachedResponse || networkResponse;
		}),
	);
});
