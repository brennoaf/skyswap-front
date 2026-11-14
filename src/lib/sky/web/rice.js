const NONZERO = new Uint8Array(256)
for (let b = 1; b < 256; b++) NONZERO[b] = 32 - Math.clz32(b)

export function riceDecode32(src, offset, nx, nblock, out, outOffset = 0) {
  const fsbits = 5, fsmax = 25, bbits = 32
  let c = offset
  let lastpix = ((src[c] << 24) | (src[c + 1] << 16) | (src[c + 2] << 8) | src[c + 3]) | 0
  c += 4
  let b = src[c++], nbits = 8
  for (let i = 0; i < nx;) {
    nbits -= fsbits
    while (nbits < 0) { b = (b << 8) | src[c++]; nbits += 8 }
    const fs = (b >>> nbits) - 1
    b &= (1 << nbits) - 1
    let imax = i + nblock
    if (imax > nx) imax = nx
    if (fs < 0) {
      for (; i < imax; i++) out[outOffset + i] = lastpix
    } else if (fs === fsmax) {
      for (; i < imax; i++) {
        let k = bbits - nbits
        let diff = k >= 32 ? 0 : (b << k) >>> 0
        for (k -= 8; k >= 0; k -= 8) { b = src[c++]; diff = (diff | (b << k)) >>> 0 }
        if (nbits > 0) { b = src[c++]; diff = (diff | (b >>> -k)) >>> 0; b &= (1 << nbits) - 1 } else { b = 0 }
        const d = (diff & 1) === 0 ? (diff >>> 1) : ~(diff >>> 1)
        lastpix = (d + lastpix) | 0
        out[outOffset + i] = lastpix
      }
    } else {
      for (; i < imax; i++) {
        while (b === 0) { nbits += 8; b = src[c++] }
        const nzero = nbits - NONZERO[b]
        nbits -= nzero + 1
        b ^= 1 << nbits
        nbits -= fs
        while (nbits < 0) { b = (b << 8) | src[c++]; nbits += 8 }
        const diff = ((nzero << fs) | (b >>> nbits)) >>> 0
        b &= (1 << nbits) - 1
        const d = (diff & 1) === 0 ? (diff >>> 1) : ~(diff >>> 1)
        lastpix = (d + lastpix) | 0
        out[outOffset + i] = lastpix
      }
    }
  }
  return c - offset
}

export function riceDecodeRows(heap, nrows, nx, nblock = 32) {
  const out = new Int32Array(nrows * nx)
  let off = 0
  for (let r = 0; r < nrows; r++) off += riceDecode32(heap, off, nx, nblock, out, r * nx)
  return { data: out, consumed: off }
}
