// Service worker required for PWA installation and Push Notifications support
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Pass-through network requests directly
  event.respondWith(fetch(event.request));
});

// Push notification event listener
self.addEventListener('push', (event) => {
  let data = { title: 'Quiniela 2026', body: 'Nueva actualización de puntos.' };
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: 'Quiniela 2026', body: event.data.text() };
    }
  }
  
  const options = {
    body: data.body,
    icon: '/icon.png',
    badge: '/icon.png',
    vibrate: [100, 50, 100],
    data: {
      url: '/'
    }
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Notification click event listener to open or focus the app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      if (clientList.length > 0) {
        let client = clientList[0];
        for (let i = 0; i < clientList.length; i++) {
          if (clientList[i].focused) {
            client = clientList[i];
          }
        }
        return client.focus();
      }
      return clients.openWindow('/');
    })
  );
});
