// Coadicao ponderada por 1/VARIANCE e diferenca entre passagens (JS puro, Float32/Float64).

// images, variances: arrays de Float32Array (n*n). Pixels com img ou var nao finitos, ou var <= 0, ficam de fora.
export function coadd(images, variances) {
  const N = images[0].length, num = new Float64Array(N), den = new Float64Array(N)
  for (let i = 0; i < images.length; i++) {
    const a = images[i], v = variances[i]
    for (let k = 0; k < N; k++) {
      const vk = v[k], ak = a[k]
      if (vk > 0 && Number.isFinite(vk) && Number.isFinite(ak)) { const w = 1 / vk; num[k] += ak * w; den[k] += w }
    }
  }
  const img = new Float32Array(N), variance = new Float32Array(N)
  for (let k = 0; k < N; k++) { img[k] = den[k] > 0 ? num[k] / den[k] : NaN; variance[k] = den[k] > 0 ? 1 / den[k] : NaN }
  return { img, variance }
}

export function difference(a, b) {
  const out = new Float32Array(a.length)
  for (let k = 0; k < a.length; k++) out[k] = b[k] - a[k]
  return out
}

// Agrupa exposicoes em passagens: um buraco de mais de gapDays dias abre uma nova passagem.
export function assignPasses(mjds, gapDays = 30) {
  const order = mjds.map((m, i) => [m, i]).sort((x, y) => x[0] - y[0])
  const out = new Array(mjds.length)
  let pid = 0, last = null
  for (const [m, i] of order) { if (last !== null && m - last > gapDays) pid++; out[i] = pid; last = m }
  return out
}
