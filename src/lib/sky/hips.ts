const D2R = Math.PI / 180
export const HIPS_TILE = 512
const TILE_BITS = 9
const PIXEL_DEG_AT_NSIDE_1 = 58.6323

export type HipsSurvey = { id: 'wise' | '2mass-j' | '2mass-h' | '2mass-k'; maxOrder: number; telescope: 'WISE' | '2MASS'; year: number; um: number }

const SURVEYS: HipsSurvey[] = [
  { id: '2mass-j', maxOrder: 9, telescope: '2MASS', year: 1999, um: 1.25 },
  { id: '2mass-h', maxOrder: 9, telescope: '2MASS', year: 1999, um: 1.65 },
  { id: '2mass-k', maxOrder: 9, telescope: '2MASS', year: 1999, um: 2.17 },
  { id: 'wise', maxOrder: 8, telescope: 'WISE', year: 2010, um: 4.6 },
]

export function surveyFor(um: number | null): HipsSurvey {
  if (um === null || um >= 2.5) return SURVEYS[3] as HipsSurvey
  return SURVEYS.slice(0, 3).reduce((a, b) => (Math.abs(b.um - um) < Math.abs(a.um - um) ? b : a))
}

export function faceXY(order: number, raDeg: number, decDeg: number) {
  const nside = 2 ** order
  const z = Math.cos((90 - decDeg) * D2R)
  const za = Math.abs(z)
  const tt = (((((raDeg % 360) + 360) % 360) * D2R) / (Math.PI / 2)) % 4
  if (za <= 2 / 3) {
    const t1 = nside * (0.5 + tt)
    const t2 = nside * z * 0.75
    const jp = Math.floor(t1 - t2)
    const jm = Math.floor(t1 + t2)
    const ifp = Math.floor(jp / nside)
    const ifm = Math.floor(jm / nside)
    const face = ifp === ifm ? ifp + 4 : ifp < ifm ? ifp : ifm + 8
    return { face, ix: ((jm % nside) + nside) % nside, iy: nside - (((jp % nside) + nside) % nside) - 1 }
  }
  const ntt = Math.min(3, Math.floor(tt))
  const tp = tt - ntt
  const tmp = nside * Math.sqrt(3 * (1 - za))
  const jp = Math.min(Math.floor(tp * tmp), nside - 1)
  const jm = Math.min(Math.floor((1 - tp) * tmp), nside - 1)
  return z >= 0 ? { face: ntt, ix: nside - jm - 1, iy: nside - jp - 1 } : { face: ntt + 8, ix: jp, iy: jm }
}

function interleave(x: number, y: number, bits: number): number {
  let p = 0
  for (let b = 0; b < bits; b++) p += ((x >> b) & 1) * 2 ** (2 * b) + ((y >> b) & 1) * 2 ** (2 * b + 1)
  return p
}

export function locate(order: number, raDeg: number, decDeg: number): { npix: number; col: number; row: number } {
  const { face, ix, iy } = faceXY(order + TILE_BITS, raDeg, decDeg)
  const npix = face * 4 ** order + interleave(Math.floor(ix / HIPS_TILE), Math.floor(iy / HIPS_TILE), order)
  return { npix, col: iy % HIPS_TILE, row: ix % HIPS_TILE }
}

export function orderFor(pixelDeg: number, maxOrder: number): number {
  const k = Math.ceil(Math.log2(PIXEL_DEG_AT_NSIDE_1 / pixelDeg)) - TILE_BITS
  return Math.max(0, Math.min(maxOrder, k))
}

export type TileReader = (npix: number) => Promise<Uint8ClampedArray | null>

export async function renderHips(n: number, pix2world: (x: number, y: number) => [number, number], order: number, read: TileReader): Promise<Float32Array> {
  const spots = new Map<number, { i: number; col: number; row: number }[]>()
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const [ra, dec] = pix2world(x, y)
      const at = locate(order, ra, dec)
      const list = spots.get(at.npix) ?? []
      list.push({ i: y * n + x, col: at.col, row: at.row })
      spots.set(at.npix, list)
    }
  }
  const out = new Float32Array(n * n).fill(Number.NaN)
  await Promise.all(
    [...spots.entries()].map(async ([npix, list]) => {
      const tile = await read(npix)
      if (!tile) return
      for (const s of list) out[s.i] = tile[(s.row * HIPS_TILE + s.col) * 4] ?? Number.NaN
    }),
  )
  return out
}
