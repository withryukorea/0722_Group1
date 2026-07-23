/* AXE-acc 모바일 서비스워커 — /app(구 "찍으면 끝")의 PWA 자산을 v2 모바일로 이관.
   전략: 앱셸은 캐시(오프라인에도 화면 뜸), /api/* 는 항상 네트워크(캐시 금지 — 실데이터).
   scope: /eaccounting/m/ (등록은 m-chrome.js). */
const CACHE = "axe-m-shell-v1";
const SHELL = [
  "./",
  "index.html",
  "capture.html",
  "receipts.html",
  "schedule.html",
  "docs.html",
  "css/mobile.css",
  "js/m-chrome.js",
  "../js/layout.js",
  "../js/quick-data.js",
  "icon.svg",
  "manifest.webmanifest",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  // 쓰기·API·타 오리진은 서비스워커가 손대지 않는다 (항상 실데이터·정직한 실패)
  if (req.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) {
    return;
  }
  // 앱셸: 네트워크 우선 → 실패 시 캐시 (오프라인 폴백)
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match("index.html")))
  );
});
