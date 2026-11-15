export type KitNote = { key: string; values: Record<string, string | number> }

type Rule = [RegExp, string, (m: RegExpExecArray) => Record<string, string | number>]

const num = (s: string | undefined) => Number(s)
const none = () => ({})

const RULES: Rule[] = [
  [/^The core is saturated in (\d+)% of images; brightness changes are indicative only\.$/, 'satPercent', (m) => ({ pct: num(m[1]) })],
  [/^The star's core is saturated in most SPHEREx images; brightness and position are indicative only\.$/, 'satMost', none],
  [/^The core is saturated in some images; those points are flagged\.$/, 'satSome', none],
  [/^The core is saturated in every band; positions come from fits to the wings of the image of the star, with about ([\d.]+)" precision per pass\.$/, 'satEveryBand', (m) => ({ arcsec: num(m[1]) })],
  [/^Images come from two releases \(QR2 and QR3\); QR3 photometry of the same stars is (\d+)-(\d+)% fainter, so small brightness changes across releases are not significant\.$/, 'twoBatches', (m) => ({ lo: num(m[1]), hi: num(m[2]) })],
  [/^Satellite trails are not flagged by SPHEREx and were not checked\.$/, 'satellites', none],
  [/^(\d+) saturated exposures were left out of the spectrum and light curve: their fitted brightness was more than 10 times off the 2MASS\/WISE catalogue value, so the fit failed\.$/, 'leftOut', (m) => ({ n: num(m[1]) })],
  [/^The fit converges in only (\d+) of (\d+) images of this very bright, saturated .+; SPHEREx numbers are not reliable\.$/, 'fitFew', (m) => ({ ok: num(m[1]), total: num(m[2]) })],
  [/^The point-source fit failed in most images, so SPHEREx numbers for this object are not reliable\.$/, 'fitFailed', none],
  [/^Detected only in bands (D\d(?:-D\d)?); the faint signal in (D\d(?:-D\d)?) at its position comes from a neighbouring star.*\.$/, 'onlyBands', (m) => ({ seen: m[1] ?? '', other: m[2] ?? '' })],
  [/^The coordinate in the NASA challenge statement is from about (\d{4}); by \S+ the object is about ([\d.]+)" \((\d+) pixels\) away from it\.$/, 'oldPosition', (m) => ({ year: m[1] ?? '', arcsec: num(m[2]), px: num(m[3]) })],
  [/^The two .+ \(about ([\d.]+)" apart\) are not separated by SPHEREx; positions and brightness are of their combined light\.$/, 'blended', (m) => ({ sep: num(m[1]) })],
  [/^Predicted positions are JPL Horizons ephemerides as seen from SPHEREx at the middle of each exposure\. Measured positions are not corrected with reference stars, so offsets below about 1 arcsecond are not meaningful\.$/, 'ephemeris', none],
  [/^Field stars are blurred in stacked frames because the stack follows the moving object\.$/, 'blurredField', none],
  [/^Brightness comes from point-source fits, which miss part of an extended coma\.$/, 'coma', none],
  [/^SIMBAD lists this object as a brown dwarf candidate\.$/, 'candidate', none],
  [/^Not detected: the measured signal at the predicted position is below \S+ sigma in every band and pass\.$/, 'notDetected', none],
]

export function kitNote(text: string): KitNote | null {
  for (const [re, key, values] of RULES) {
    const m = re.exec(text)
    if (m) return { key, values: values(m) }
  }
  return null
}

export function kitNotes(limits: string[]): KitNote[] {
  return limits.flatMap((l) => {
    const n = kitNote(l)
    return n ? [n] : []
  })
}

export function noteValues(values: KitNote['values'], locale: string): Record<string, string | number> {
  const to = locale.startsWith('pt') ? ' a ' : ' to '
  return Object.fromEntries(Object.entries(values).map(([k, v]) => [k, typeof v === 'number' ? (k === 'n' ? v : v.toLocaleString(locale)) : v.replace(/^(D\d)-(D\d)$/, `$1${to}$2`)]))
}
