/**
 * FeelGood Conduite — Service Worker
 * Garde l'app active en arrière-plan pendant l'enregistrement d'un trajet.
 */

const CACHE_NAME = 'feelgood-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Keepalive : répond aux messages ping envoyés par l'app
self.addEventListener('message', (event) => {
  if (event.data === 'ping') {
    event.source?.postMessage('pong');
  }

  if (event.data?.type === 'TRIP_STARTED') {
    // Afficher une notification persistante
    self.registration.showNotification('FeelGood Conduite', {
      body: 'Trajet en cours… Ne fermez pas l\'application.',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'trip-in-progress',
      renotify: false,
      requireInteraction: true,
      silent: true,
      data: { url: '/record' },
    });
  }

  if (event.data?.type === 'TRIP_STOPPED') {
    // Fermer la notification persistante
    self.registration.getNotifications({ tag: 'trip-in-progress' }).then((notifs) => {
      notifs.forEach(n => n.close());
    });
  }
});

// Ouvrir l'app si l'utilisateur clique sur la notification
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes('/record') && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow('/record');
      }
    })
  );
});
