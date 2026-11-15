const VERSION = 'index-2026.11.15-split-1'
const S3_HOSTS = ['nasa-irsa-spherex.s3.amazonaws.com', 'nasa-irsa-spherex.s3.us-east-1.amazonaws.com',
  's3.us-east-1.amazonaws.com', 's3.amazonaws.com', 'nasa-irsa-spherex.s3.dualstack.us-east-1.amazonaws.com']
const RANGE_PREFIX = '/__s3cache'
const RANGE_MAX_ENTRIES = 400
const RANGE_MAX_BYTES = 150 * 1024 * 1024
const RANGE_TRIM_TO = 0.8

let rangeBytes = null
let trimming = null

self.addEventListener('install', e => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())))

self.addEventListener('message', e => {
  if (e.data === 'clear') {
    rangeBytes = null
    e.waitUntil(caches.delete(VERSION).then(() => e.source.postMessage('cleared')))
  }
})

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET') return
  const range = e.request.headers.get('range')
  if ((S3_HOSTS.includes(url.hostname) || (url.origin === location.origin && url.pathname.startsWith('/api/s3/'))) && range) {
    e.respondWith(s3Range(e, range))
  } else if (url.origin === location.origin && url.pathname.startsWith('/api/crop/') && !range) {
    e.respondWith(cropped(e, url))
  } else if (url.origin === location.origin && /^\/kit\/(index|objects|deck)\//.test(url.pathname) && !range) {
    e.respondWith(cacheFirst(e.request))
  }
})

async function cacheFirst(req) {
  const c = await caches.open(VERSION)
  const hit = await c.match(req)
  if (hit) return withHeader(hit, 'sw-hit')
  const r = await fetch(req)
  if (r.ok) await c.put(req, r.clone()).catch(() => undefined)
  return r
}

async function s3Range(e, range) {
  const req = e.request
  const c = await caches.open(VERSION)
  const path = new URL(req.url).pathname.replace(/^\/(nasa-irsa-spherex|api\/s3)\//, '/')
  const key = new Request(`${location.origin}${RANGE_PREFIX}${path}?r=${encodeURIComponent(range)}`)
  const hit = await c.match(key)
  if (hit) return new Response(await hit.arrayBuffer(), { status: 206, headers: { 'x-sw': 'hit' } })
  const r = await fetch(req)
  if (r.status !== 206) return r
  const buf = await r.arrayBuffer()
  e.waitUntil(storeRange(c, key, buf))
  return new Response(buf, { status: 206, headers: { 'x-sw': 'miss' } })
}

async function cropped(e, url) {
  const c = await caches.open(VERSION)
  const key = new Request(`${location.origin}${RANGE_PREFIX}${url.pathname.replace(/^\/api\/crop\//, '/crop/')}${url.search}`)
  const hit = await c.match(key)
  if (hit) return new Response(await hit.arrayBuffer(), { status: 200, headers: { 'x-sw': 'hit' } })
  const r = await fetch(e.request)
  if (r.status !== 200) return r
  const buf = await r.arrayBuffer()
  e.waitUntil(storeRange(c, key, buf))
  return new Response(buf, { status: 200, headers: { 'x-sw': 'miss' } })
}

async function storeRange(c, key, buf) {
  try {
    await c.put(key, new Response(buf.slice(0), { status: 200, headers: { 'content-type': 'application/octet-stream', 'content-length': String(buf.byteLength), 'x-stored': String(Date.now()) } }))
    if (rangeBytes !== null) rangeBytes += buf.byteLength
  } catch {
    await trimRanges(c, true)
    return
  }
  await trimRanges(c, false)
}

async function rangeEntries(c) {
  const keys = (await c.keys()).filter(k => new URL(k.url).pathname.startsWith(RANGE_PREFIX))
  const entries = []
  for (const k of keys) {
    const r = await c.match(k)
    if (r) entries.push({ k, bytes: Number(r.headers.get('content-length')) || 0, at: Number(r.headers.get('x-stored')) || 0 })
  }
  return entries
}

function trimRanges(c, force) {
  trimming ??= (async () => {
    try {
      const keys = (await c.keys()).filter(k => new URL(k.url).pathname.startsWith(RANGE_PREFIX))
      if (!force && rangeBytes !== null && keys.length <= RANGE_MAX_ENTRIES && rangeBytes <= RANGE_MAX_BYTES) return
      const entries = (await rangeEntries(c)).sort((a, b) => a.at - b.at)
      let total = entries.reduce((s, x) => s + x.bytes, 0)
      let count = entries.length
      const maxCount = force ? Math.floor(count / 2) : RANGE_MAX_ENTRIES
      const maxBytes = force ? total / 2 : RANGE_MAX_BYTES
      if (count > maxCount || total > maxBytes) {
        for (const x of entries) {
          if (count <= maxCount * RANGE_TRIM_TO && total <= maxBytes * RANGE_TRIM_TO) break
          await c.delete(x.k)
          count--
          total -= x.bytes
        }
      }
      rangeBytes = total
    } catch {
      rangeBytes = null
    } finally {
      trimming = null
    }
  })()
  return trimming
}

async function withHeader(r, v) {
  const h = new Headers(r.headers)
  h.set('x-sw', v)
  return new Response(await r.arrayBuffer(), { status: r.status, headers: h })
}
