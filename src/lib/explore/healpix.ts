const D2R = Math.PI / 180
const JRLL = [2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4]
const JPLL = [1, 3, 5, 7, 0, 2, 4, 6, 1, 3, 5, 7]

export function pix2angNest(order: number, pix: number): [number, number] {
  const nside = 2 ** order
  const npface = nside * nside
  const face = Math.floor(pix / npface)
  const ipf = pix % npface
  let ix = 0
  let iy = 0
  for (let b = 0; b < order; b++) {
    ix |= ((ipf >> (2 * b)) & 1) << b
    iy |= ((ipf >> (2 * b + 1)) & 1) << b
  }
  const jr = (JRLL[face] as number) * nside - ix - iy - 1
  let nr: number
  let z: number
  let kshift: number
  if (jr < nside) {
    nr = jr
    z = 1 - (nr * nr) / (3 * npface)
    kshift = 0
  } else if (jr > 3 * nside) {
    nr = 4 * nside - jr
    z = (nr * nr) / (3 * npface) - 1
    kshift = 0
  } else {
    nr = nside
    z = ((2 * nside - jr) * 2) / (3 * nside)
    kshift = (jr - nside) & 1
  }
  let jp = Math.trunc(((JPLL[face] as number) * nr + ix - iy + 1 + kshift) / 2)
  if (jp > 4 * nside) jp -= 4 * nside
  if (jp < 1) jp += 4 * nside
  const phi = (jp - (kshift + 1) * 0.5) * (Math.PI / 2 / nr)
  return [phi / D2R, 90 - Math.acos(z) / D2R]
}

export function hammer(raDeg: number, decDeg: number): [number, number] {
  const l = ((((raDeg + 180) % 360) + 360) % 360 - 180) * D2R
  const b = decDeg * D2R
  const k = Math.sqrt(1 + Math.cos(b) * Math.cos(l / 2))
  return [-(2 * Math.SQRT2 * Math.cos(b) * Math.sin(l / 2)) / k / (2 * Math.SQRT2), (Math.SQRT2 * Math.sin(b)) / k / Math.SQRT2]
}
