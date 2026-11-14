// Teste minimo em Node: decodifica um pacote de ciencia do SkySwap (pack.json + pack_<banda>.bin) com os modulos do
// navegador (cachefmt.js, ../sci/wcs.js, ../sci/phot.js) e compara com a referencia Python (arch/pack_reference.py).
// Uso: node arch/web/pack_check.mjs <pasta science> [referencia.json] [prefixo, padrao pack]
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { decodeSxq, unpack } from './cachefmt.js'
import { makeWcs } from '../sci/wcs.js'
import { measureStar } from '../sci/phot.js'

const here = dirname(fileURLToPath(import.meta.url))
const dir = resolve(process.argv[2] ?? join(here, '../../../skyswap/data/objects/eps-indi-b/science'))
const prefix = process.argv[4] || 'pack'
const man = JSON.parse(readFileSync(join(dir, `${prefix}.json`), 'utf8'))
const refPath = process.argv[3] || join(here, `../results/skyswap/pack_reference_${man.object_id}_${prefix}.json`)
const ref = JSON.parse(readFileSync(refPath, 'utf8'))
const refBy = new Map(ref.rows.map(r => [`${r.band}:${r.index}`, r]))
const sha = a => createHash('sha256').update(Buffer.from(a.buffer, a.byteOffset, a.byteLength)).digest('hex')

const t0 = performance.now()
let n = 0, imgOk = 0, flagsOk = 0, varWorst = 0, nanOk = 0, measured = 0, agree = 0, rejectSame = 0
const agreeWorst = { flux_sigma: 0, xy_px: 0, lam_um: 0 }
// A decodificacao tem de ser identica. A fotometria usa um ajuste de gaussiana 2D (5x5 px) para refinar o centroide,
// e o otimizador do JS pode parar num ponto um pouco diferente do photutils (sobretudo sem estrela, S/R < 3):
// contamos as exposicoes que concordam (< 1e-3 sigma) e listamos as outras.
const disagree = []
for (const [band, info] of Object.entries(man.bands)) {
  const b = readFileSync(join(dir, info.file))
  const parts = unpack(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength))
  for (const ep of man.epochs.filter(e => e.band === band)) {
    const r = refBy.get(`${band}:${ep.index}`)
    if (!r) continue
    const d = await decodeSxq(parts[ep.index])
    n++
    if (sha(d.image) === r.sha_image) imgOk++
    if (sha(d.flags) === r.sha_flags) flagsOk++
    let vs = 0, vn = 0
    for (const v of d.variance) { if (Number.isNaN(v)) vn++; else vs += v }
    if (vn === r.var_nan) nanOk++
    varWorst = Math.max(varWorst, r.var_sum ? Math.abs(vs / r.var_sum - 1) : 0)
    const p = measureStar(d.image, d.variance, d.flags, ep.nx, ep.ny, makeWcs({ wcs: ep.wcs, sip: ep.sip }), ep.target_radec[0], ep.target_radec[1], ep.wave)
    if ((p === null) !== (r.phot === null) || (p && (!!p.rejected !== !!r.phot.rejected))) {
      disagree.push({ band, index: ep.index, outcome_js: p === null ? 'outside' : p.rejected ? 'rejected' : 'measured', outcome_py: r.phot === null ? 'outside' : r.phot.rejected ? 'rejected' : 'measured' })
      continue
    }
    rejectSame++
    if (p && !p.rejected) {
      measured++
      const z = Math.abs(p.flux_mjy - r.phot.flux_mjy) / r.phot.err_mjy, dxy = Math.hypot(p.x - r.phot.x, p.y - r.phot.y)
      if (z < 1e-3 && dxy < 0.01) {
        agree++
        agreeWorst.flux_sigma = Math.max(agreeWorst.flux_sigma, z); agreeWorst.xy_px = Math.max(agreeWorst.xy_px, dxy)
        agreeWorst.lam_um = Math.max(agreeWorst.lam_um, Math.abs(p.wavelength_um - r.phot.wavelength_um))
      } else disagree.push({ band, index: ep.index, snr: +(r.phot.flux_mjy / r.phot.err_mjy).toFixed(2), flux_diff_sigma: +z.toFixed(4), xy_diff_px: +dxy.toFixed(4), refined_js: p.refined, refined_py: r.phot.refined })
    }
  }
}
const res = { object: man.object_id, prefix, epochs: n, image_identical: imgOk, flags_identical: flagsOk, variance_nan_identical: nanOk,
  variance_sum_rel_diff_max: varWorst, photometry_same_outcome: rejectSame, photometry_measured: measured, photometry_agree: agree,
  photometry_agree_worst: agreeWorst, disagreements: disagree.slice(0, 20), n_disagreements: disagree.length, ms: Math.round(performance.now() - t0) }
console.log(JSON.stringify(res, null, 1))
const ok = n > 0 && imgOk === n && flagsOk === n && nanOk === n && varWorst < 1e-5 && rejectSame >= 0.99 * n && agree >= 0.97 * measured
console.log(ok ? 'OK: o JS reproduz a referencia Python' : 'FALHOU')
process.exit(ok ? 0 : 1)
