// Reamostragem para uma grade comum, em JS puro.
//  bilinear(): igual ao reproject_interp (order=1): coordenadas a menos de meio pixel fora da borda sao presas na
//              borda; alem disso NaN; NaN de qualquer vizinho se propaga (como scipy.ndimage.map_coordinates).
//  adaptive(): porte do algoritmo de DeForest (2004) em reproject/adaptive/deforest.pyx (reproject 0.21, BSD-3):
//              jacobiano pelas diferencas do mapa de coordenadas com borda, SVD 2x2 com valores singulares >= 1,
//              nucleo gaussiano (largura 1,3, regiao 4) ou Hann, borda "strict", valores ruins "strict",
//              conserve_flux multiplica por |det J|. Corrige um detalhe do original: divisao por soma de pesos 0 -> NaN.

export function bilinear(src, sw, sh, map, n, out = new Float32Array(n * n)) {
  for (let k = 0; k < n * n; k++) {
    let x = map[2 * k], y = map[2 * k + 1]
    if (!(x >= -0.5 && x <= sw - 0.5 && y >= -0.5 && y <= sh - 0.5)) { out[k] = NaN; continue }
    if (x < 0) x = 0; else if (x > sw - 1) x = sw - 1
    if (y < 0) y = 0; else if (y > sh - 1) y = sh - 1
    // estencil como no scipy (ordem 1): comeca em min(floor(x), n-2) e os 4 vizinhos entram na soma mesmo com
    // peso 0 -> NaN de qualquer vizinho se propaga (medido: arch/results/round3/scipy_nan_rule.json)
    const x0 = Math.min(Math.floor(x), sw - 2), y0 = Math.min(Math.floor(y), sh - 2), tx = x - x0, ty = y - y0
    const x1 = x0 + 1, y1 = y0 + 1
    const a = src[y0 * sw + x0], b = src[y0 * sw + x1], c = src[y1 * sw + x0], d = src[y1 * sw + x1]
    out[k] = (1 - tx) * (1 - ty) * a + tx * (1 - ty) * b + (1 - tx) * ty * c + tx * ty * d
  }
  return out
}

function svd2(m00, m01, m10, m11) {
  const E = (m00 + m11) / 2, F = (m00 - m11) / 2, G = (m10 + m01) / 2, H = (m10 - m01) / 2
  const Q = Math.hypot(E, H), R = Math.hypot(F, G)
  const a1 = Math.atan2(G, F), a2 = Math.atan2(H, E), th = (a2 - a1) / 2, ph = (a2 + a1) / 2
  return { s0: Q + R, s1: Q - R, U: [Math.cos(ph), -Math.sin(ph), Math.sin(ph), Math.cos(ph)], V: [Math.cos(th), Math.sin(th), -Math.sin(th), Math.cos(th)] }
}

function compose(U, s0, s1, V) {
  const t00 = U[0] * s0, t01 = U[1] * s1, t10 = U[2] * s0, t11 = U[3] * s1
  return [t00 * V[0] + t01 * V[1], t00 * V[2] + t01 * V[3], t10 * V[0] + t11 * V[1], t10 * V[2] + t11 * V[3]]
}

// mapPad: mapa de coordenadas com pad = 1 (dimensao (n+2)^2), de coordMap(..., { pad: 1 })
export function adaptive(src, sw, sh, mapPad, n, { kernel = 'gaussian', kernelWidth = 1.3, sampleRegionWidth = 4,
  conserveFlux = false } = {}, out = new Float32Array(n * n)) {
  const m = n + 2
  const P = (j, i, k) => mapPad[2 * (j * m + i) + k] // j, i na grade com borda
  const hann = kernel !== 'gaussian'
  for (let yi = 0; yi < n; yi++) {
    for (let xi = 0; xi < n; xi++) {
      // Jx[yi, xi] = d(entrada)/d(x_saida) em (xi - 0,5, yi); Jy idem em y. Ji = media de dois vizinhos.
      const jx0a = -P(yi + 1, xi, 0) + P(yi + 1, xi + 1, 0), jx1a = -P(yi + 1, xi, 1) + P(yi + 1, xi + 1, 1)
      const jx0b = -P(yi + 1, xi + 1, 0) + P(yi + 1, xi + 2, 0), jx1b = -P(yi + 1, xi + 1, 1) + P(yi + 1, xi + 2, 1)
      const jy0a = -P(yi, xi + 1, 0) + P(yi + 1, xi + 1, 0), jy1a = -P(yi, xi + 1, 1) + P(yi + 1, xi + 1, 1)
      const jy0b = -P(yi + 1, xi + 1, 0) + P(yi + 2, xi + 1, 0), jy1b = -P(yi + 1, xi + 1, 1) + P(yi + 2, xi + 1, 1)
      const J00 = (jx0a + jx0b) / 2, J10 = (jx1a + jx1b) / 2, J01 = (jy0a + jy0b) / 2, J11 = (jy1a + jy1b) / 2
      const px = P(yi + 1, xi + 1, 0), py = P(yi + 1, xi + 1, 1)
      const k = yi * n + xi
      if (!(Number.isFinite(J00) && Number.isFinite(J01) && Number.isFinite(J10) && Number.isFinite(J11) && Number.isFinite(px) && Number.isFinite(py))) { out[k] = NaN; continue }
      const { s0, s1, U, V } = svd2(J00, J01, J10, J11)
      const S0 = Math.max(1, s0), S1 = Math.max(1, s1)
      const Jp = compose(U, S0, S1, V)
      const Ji = compose(V, 1 / S0, 1 / S1, U) // J = inverso de Ji acolchoado
      let top, bottom, left, right
      if (hann) {
        const P1 = [-Jp[0] + Jp[1], -Jp[2] + Jp[3]], P2 = [Jp[0] + Jp[1], Jp[2] + Jp[3]], P3 = [-Jp[0] - Jp[1], -Jp[2] - Jp[3]], P4 = [Jp[0] - Jp[1], Jp[2] - Jp[3]]
        top = Math.max(P1[1], P2[1], P3[1], P4[1]); bottom = Math.min(P1[1], P2[1], P3[1], P4[1])
        right = Math.max(P1[0], P2[0], P3[0], P4[0]); left = Math.min(P1[0], P2[0], P3[0], P4[0])
      } else {
        top = sampleRegionWidth / (2 * Math.min(1 / S0, 1 / S1)); bottom = -top; right = top; left = -right
      }
      top = Math.floor(top + py); bottom = Math.ceil(bottom + py); right = Math.floor(right + px); left = Math.ceil(left + px)
      if (right > sw - 1 || left < 0 || top > sh - 1 || bottom < 0) { out[k] = NaN; continue } // borda "strict"
      let acc = 0, wsum = 0
      for (let y = bottom; y <= top; y++) {
        const oy = y - py
        let sampled = false
        for (let x = left; x <= right; x++) {
          const ox = x - px
          const t0 = Ji[0] * ox + Ji[1] * oy, t1 = Ji[2] * ox + Ji[3] * oy
          let w
          if (hann) { const ax = Math.abs(t0), ay = Math.abs(t1); w = ax >= 1 || ay >= 1 ? 0 : (Math.cos(ax * Math.PI) + 1) * (Math.cos(ay * Math.PI) + 1) } else w = Math.exp(-(t0 * t0 + t1 * t1) / (kernelWidth * kernelWidth) * 2)
          if (w === 0) { if (sampled) break; continue }
          sampled = true
          acc += w * src[y * sw + x] // valores ruins "strict": NaN contamina o pixel, como no original
          wsum += w
        }
      }
      let v = wsum > 0 ? acc / wsum : NaN
      if (conserveFlux) v *= Math.abs(J00 * J11 - J01 * J10)
      out[k] = v
    }
  }
  return out
}
