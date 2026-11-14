// Teste minimo em Node: le os ladrilhos do indice do SkySwap com o mesmo codigo do navegador (spherex.js + hyparquet)
// e confere contra a resposta Python (arch/results/skyswap/index_validation.json, pontos de controle).
// Uso: node arch/web/index_check.mjs ../skyswap/data/index
import { readFileSync, existsSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { epochsAtTile } from './spherex.js'

const here = dirname(fileURLToPath(import.meta.url))
const base = resolve(process.argv[2] ?? join(here, '../../../skyswap/data/index'))
// fetch de disco: o mesmo contrato do fetch do navegador (404 quando o ladrilho nao existe)
const fileFetch = async url => {
  const p = url.startsWith('file:') ? fileURLToPath(url) : url
  if (!existsSync(p)) return new Response(null, { status: 404 })
  const b = readFileSync(p)
  return new Response(b, { status: 200, headers: { 'content-length': String(b.length) } })
}
const wave = JSON.parse(readFileSync(join(base, 'wave.json'), 'utf8'))
const val = JSON.parse(readFileSync(join(here, '../results/skyswap/index_validation.json'), 'utf8'))
let n = 0, same = 0, ms = 0, bytes = 0
const diffs = []
for (const p of val.points.filter(p => !p.error)) {
  const q = await epochsAtTile(base.replace(/\\/g, '/') + '/', wave, p.ra, p.dec, { fetchImpl: fileFetch })
  ms += q.ms; bytes += q.bytes
  // spherex.js usa o quadrilatero dos cantos; a referencia Python usa o WCS completo: compara com as imagens do SIA
  const js = new Set(q.hits.map(h => h.key).filter(k => val.periods.includes(k.split('/')[2])))
  n++
  const sia = p.sia
  if (js.size === sia) same++
  else diffs.push({ ra: +p.ra.toFixed(3), dec: +p.dec.toFixed(3), js: js.size, sia, python_index: p.index })
  for (const h of q.hits) if (!Number.isInteger(h.off_image) || !Array.isArray(Array.from(h.wcs))) throw new Error('coluna inesperada')
}
const res = { points: n, same_count_as_sia: same, diffs, mean_ms: +(ms / n).toFixed(1), mean_tile_kb: +(bytes / n / 1024).toFixed(1) }
console.log(JSON.stringify(res, null, 1))
process.exit(same >= n - Math.ceil(0.05 * n) ? 0 : 1)
