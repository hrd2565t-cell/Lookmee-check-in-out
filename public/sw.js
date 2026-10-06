/* LOOKMEE service worker — แคชไฟล์คงที่ (JS/CSS/โมเดล/ไอคอน) ให้โหลดซ้ำไว + ทนเน็ตหลุด
   หมายเหตุ: หน้าเว็บ (navigation) ปล่อยผ่านเน็ตตามปกติ ข้อมูลสแกนกันหายด้วยคิวออฟไลน์อยู่แล้ว */
const CACHE = "lookmee-static-v1";
const STATIC_RE = /\/(_next\/static|models|icons)\/|\/(logo\.jpg|manifest\.webmanifest|favicon\.ico)$/;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return; // ข้าม third-party (Supabase เป็นต้น)
  if (request.mode === "navigate") return; // หน้าเว็บปล่อยผ่านเน็ต
  if (!STATIC_RE.test(url.pathname)) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(request);
      if (hit) {
        // stale-while-revalidate: เสิร์ฟของเก่า แล้วแอบอัปเดตเบื้องหลัง
        event.waitUntil(
          fetch(request)
            .then((res) => {
              if (res && res.ok) cache.put(request, res.clone());
            })
            .catch(() => {}),
        );
        return hit;
      }
      const res = await fetch(request);
      if (res && res.ok) cache.put(request, res.clone());
      return res;
    })(),
  );
});
