// Fundo suave (zodiacal residual + luz espalhada), aproximacao do photutils Background2D usado no pipeline:
// caixas de `box` px (24 por padrao, menor em recortes pequenos como no pipeline), mediana com sigma-clip 3,
// caixas com menos de 50% de pixels validos sao descartadas (exclude_percentile = 50) e preenchidas pela mediana
// global, filtro de mediana 3x3 na malha e interpolacao BILINEAR entre centros de caixa (o photutils usa spline
// cubica -- a diferenca e medida em arch/results/round3/background_vs_photutils.json).
import { sigmaClippedStats } from './phot.js'

export function background(img, mask, w, h) {
  const box = Math.max(8, Math.min(24, Math.floor(h / 4), Math.floor(w / 4)))
  const nbx = Math.ceil(w / box), nby = Math.ceil(h / box)
  const grid = new Float64Array(nbx * nby).fill(NaN)
  const all = []
  for (let k = 0; k < img.length; k++) if (!(mask && mask[k]) && Number.isFinite(img[k])) all.push(img[k])
  const global = all.length ? sigmaClippedStats(all, 3)[1] : 0
  for (let by = 0; by < nby; by++) for (let bx = 0; bx < nbx; bx++) {
    const vals = []
    let tot = 0
    for (let y = by * box; y < Math.min(h, (by + 1) * box); y++) for (let x = bx * box; x < Math.min(w, (bx + 1) * box); x++) {
      tot++
      const k = y * w + x
      if (!(mask && mask[k]) && Number.isFinite(img[k])) vals.push(img[k])
    }
    if (vals.length >= 0.5 * tot) grid[by * nbx + bx] = sigmaClippedStats(vals, 3)[1]
  }
  for (let k = 0; k < grid.length; k++) if (!Number.isFinite(grid[k])) grid[k] = global
  // filtro de mediana 3x3
  const filt = new Float64Array(grid.length)
  for (let by = 0; by < nby; by++) for (let bx = 0; bx < nbx; bx++) {
    const v = []
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const yy = Math.min(nby - 1, Math.max(0, by + dy)), xx = Math.min(nbx - 1, Math.max(0, bx + dx))
      v.push(grid[yy * nbx + xx])
    }
    v.sort((a, b) => a - b)
    filt[by * nbx + bx] = v[4]
  }
  // interpolacao bilinear entre centros das caixas
  const out = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    const gy = Math.min(nby - 1, Math.max(0, (y + 0.5) / box - 0.5)), y0 = Math.min(nby - 2, Math.floor(gy)), ty = nby > 1 ? gy - Math.max(0, y0) : 0
    for (let x = 0; x < w; x++) {
      const gx = Math.min(nbx - 1, Math.max(0, (x + 0.5) / box - 0.5)), x0 = Math.min(nbx - 2, Math.floor(gx)), tx = nbx > 1 ? gx - Math.max(0, x0) : 0
      const X0 = Math.max(0, x0), Y0 = Math.max(0, y0), X1 = Math.min(nbx - 1, X0 + 1), Y1 = Math.min(nby - 1, Y0 + 1)
      out[y * w + x] = filt[Y0 * nbx + X0] * (1 - tx) * (1 - ty) + filt[Y0 * nbx + X1] * tx * (1 - ty) + filt[Y1 * nbx + X0] * (1 - tx) * ty + filt[Y1 * nbx + X1] * tx * ty
    }
  }
  return out
}
