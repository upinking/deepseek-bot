/* Cache the application shell only. Private API responses never enter a cache. */
const CACHE = 'deepseek-bot-shell-v3';
const ROOT = new URL('./', self.registration.scope);
const SHELL = ['./', './style.css', './app.js', './assets/icon.png', './manifest.webmanifest'].map(function (path) { return new URL(path, ROOT).href; });
self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(CACHE).then(function (cache) { return cache.addAll(SHELL); }));
});
self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (keys) { return Promise.all(keys.filter(function (key) { return key.startsWith('deepseek-bot-shell-') && key !== CACHE; }).map(function (key) { return caches.delete(key); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('message', function (event) { if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('fetch', function (event) {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== ROOT.origin || url.pathname.includes('/api/')) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(function () { return caches.match(ROOT.href); }));
    return;
  }
  if (!SHELL.includes(url.href)) return;
  event.respondWith(fetch(event.request).then(function (response) {
    if (response.ok) { const copy = response.clone(); caches.open(CACHE).then(function (cache) { cache.put(event.request, copy); }); }
    return response;
  }).catch(function () { return caches.match(event.request); }));
});
self.addEventListener('push', function (event) {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) { data = {body: event.data ? event.data.text() : ''}; }
  const details = data.data || {};
  const target = new URL('./', ROOT);
  const conversation = data.conversation_id || details.conversation_id;
  if (conversation) target.searchParams.set('conversation', conversation);
  if (data.url) {
    try {
      const supplied = new URL(data.url, ROOT);
      if (supplied.origin === ROOT.origin && supplied.pathname.startsWith(ROOT.pathname)) target.href = supplied.href;
    } catch (_) {}
  }
  event.waitUntil(self.registration.showNotification(data.title || 'DeepSeek Bot', {
    body: data.body || data.message || '你的 Bot 有了新的消息。',
    icon: new URL('./assets/icon.png', ROOT).href,
    badge: new URL('./assets/icon.png', ROOT).href,
    tag: data.tag || data.task_id || 'deepseek-bot',
    data: {url: target.href}
  }));
});
self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const url = event.notification.data && event.notification.data.url || ROOT.href;
  event.waitUntil(self.clients.matchAll({type: 'window', includeUncontrolled: true}).then(async function (clients) {
    for (const client of clients) {
      if (client.url.startsWith(ROOT.href)) { if (client.navigate) await client.navigate(url); return client.focus(); }
    }
    return self.clients.openWindow(url);
  }));
});
