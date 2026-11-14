// Service worker da PoC (rodada 2): cache-first para o indice, o cache sxq e as leituras Range do S3.
// A Cache API nao aceita respostas 206: guardamos o corpo como 200 numa chave sintetica (URL + faixa) e devolvemos 206.
const VERSION = 'kit-2026.10.29-1'
const S3_HOSTS = ['nasa-irsa-spherex.s3.amazonaws.com', 'nasa-irsa-spherex.s3.us-east-1.amazonaws.com',
  's3.us-east-1.amazonaws.com', 's3.amazonaws.com', 'nasa-irsa-spherex.s3.dualstack.us-east-1.amazonaws.com']

self.addEventListener('install', e => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))

self.addEventListener('message', e => {
  if (e.data === 'clear') e.waitUntil(caches.delete(VERSION).then(() => e.source.postMessage('cleared')))
})

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET') return
  const range = e.request.headers.get('range')
  if (S3_HOSTS.includes(url.hostname) && range) {
    e.respondWith(s3Range(e.request, range))
  } else if (url.origin === location.origin && /^\/kit\/(index|objects)\//.test(url.pathname) && !range) {
    e.respondWith(cacheFirst(e.request))
  }
})

async function cacheFirst(req) {
  const c = await caches.open(VERSION)
  const hit = await c.match(req)
  if (hit) return withHeader(hit, 'sw-hit')
  const r = await fetch(req)
  if (r.ok) await c.put(req, r.clone())
  return r
}

async function s3Range(req, range) {
  const c = await caches.open(VERSION)
  // a chave ignora o hostname: o mesmo objeto via qualquer endpoint compartilha o cache
  const path = new URL(req.url).pathname.replace(/^\/nasa-irsa-spherex\//, '/')
  const key = new Request(`${location.origin}/__s3cache${path}?r=${encodeURIComponent(range)}`)
  const hit = await c.match(key)
  if (hit) return new Response(await hit.arrayBuffer(), { status: 206, headers: { 'x-sw': 'hit' } })
  const r = await fetch(req)
  if (r.status !== 206) return r
  const buf = await r.arrayBuffer()
  await c.put(key, new Response(buf, { status: 200, headers: { 'content-type': 'application/octet-stream' } }))
  return new Response(buf, { status: 206, headers: { 'x-sw': 'miss' } })
}

async function withHeader(r, v) {
  const h = new Headers(r.headers)
  h.set('x-sw', v)
  return new Response(await r.arrayBuffer(), { status: r.status, headers: h })
}
