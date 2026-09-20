const CACHE_NAME = "market-intelligence-v2";

const STATIC_ASSETS = [
  "/",
  "/dashboard",
  "/manifest.webmanifest",
  "/favicon.ico"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Pass API requests straight to network
  if (event.request.url.includes("/api/")) {
    return;
  }

  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});

// Obsługa Web Push
self.addEventListener("push", (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const title = data.title || "Giełda AI — Alert";
    const options = {
      body: data.body || "Nowe powiadomienie z systemu rynkowego",
      icon: data.icon || "/icons/icon-192.png",
      badge: data.badge || "/icons/icon-192.png",
      data: {
        url: data.url || "/alerts",
      },
      vibrate: [100, 50, 100],
      tag: data.tag || "market-alert",
      renotify: true,
    };

    event.waitUntil(self.registration.showNotification(title, options));
  } catch (err) {
    console.error("Błąd przetwarzania powiadomienia push w Service Workerze:", err);
  }
});

// Obsługa kliknięcia w powiadomienie Push
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || "/dashboard";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Jeśli aplikacja jest już otwarta w karcie, skup na niej uwagę
      for (const client of clientList) {
        if (client.url.includes(urlToOpen) && "focus" in client) {
          return client.focus();
        }
      }
      // W przeciwnym razie otwórz nowe okno/kartę
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
