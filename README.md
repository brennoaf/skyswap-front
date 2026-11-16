# SkySwap

**Find what moves in the sky, with real NASA data.**

SkySwap is a public web app that turns the SPHEREx sky archive into a feed anyone can scroll. Each profile is a real object in the sky. The photos are real SPHEREx images. Live at **https://skyswap-app.vercel.app**.

## Why

SPHEREx photographs the whole sky every six months. Anything that moves across those images gives itself away by changing position: asteroids, comets, nearby brown dwarfs, perhaps a distant planet. The archive, however, is built for specialists. Comparing one patch of sky across months means finding the files, cutting the same region from each one and lining them up. SkySwap removes those steps.

## What it does

- **Swap.** Photos of the same patch taken months apart blink on screen. People answer one question, "did something move?", and mark where with a magnifier. Answers are blind.
- **Findings.** Five careful answers make a candidate. The app checks it against Gaia, SIMBAD and known asteroids, and the community discusses it.
- **Any point in the sky.** Any coordinate opens as a time-lapse, can be compared with older WISE and 2MASS images, and can be shared as a link.
- **Spectrum in plain words.** The app measures the infrared colors and writes what stands out, such as water, methane or carbon dioxide.
- **Lab.** Stacking, stacking along a motion, brightness over time and per-pixel quality flags, all in the browser.

## How it works

The app talks to the SkySwap API, a separate repository, for accounts, answers and findings. Two heavier jobs run in the browser.

1. **Reading the sky index.**
   - The sky is split into 12,288 equal cells (HEALPix).
   - For a point, the app downloads the light file of its cell, keeps the photos whose corners cover the point, and then fetches the per-image details it needs in parallel. That comes to about 336 KB for a point.
   - The index lists 1,628,230 public images (DR1 and QR3) in 1.6 GB.
2. **Processing images.** Cropping, quality masks, wavelength per pixel, stacking and photometry run in the browser, with WebGPU where available.

The interface is phone-first. It also works with keyboard and mouse, in English and Portuguese, and in light and dark themes.

## Run it

Requires Node.js 22 and the API running on port 4000.

```bash
npm install
npm run dev        # http://localhost:3000
```

| Variable | Default | Meaning |
|---|---|---|
| `SKYSWAP_API_URL` | `http://127.0.0.1:4000` | API address. `/api` and `/kit` are forwarded to it |

Other commands:

```bash
npm run build
npm run typecheck
npm run lint
npm run api:types   # regenerates API types from the API's OpenAPI file
```

## Design rules

- **Plain language.** No jargon without explanation.
- **Honest science.** Machine guesses are always labeled as guesses. A candidate stays a candidate until a person checks it.
- **Scientific images are never cropped** for looks.
- **Fair participation.** No leaderboards of people, and no feature locked behind a level.
- **Privacy.** Sign-in uses passkeys and a QR code, with no email, phone or name stored.

## Stack

- Next.js and React, in TypeScript;
- next-intl for translations;
- TanStack Query for data;
- hyparquet and fzstd for reading the sky index in the browser;
- SimpleWebAuthn for passkeys.

Deployed on Vercel.

## Data credits

- SPHEREx, WISE and 2MASS images: NASA/JPL-Caltech/IPAC, via IRSA.
- Orbits: JPL Horizons.
- Catalog checks: ESA Gaia, SIMBAD (CDS), the Minor Planet Center and IMCCE.
- Profile pictures: crops from the NASA Image and Video Library.
- Measurements shown in the app are made by SkySwap from these data.

Real data. Real people. Find what moves.
