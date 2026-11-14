const WG = 64

const BILINEAR = `
struct P { sw: u32, sh: u32, n: u32, pad: u32 }
@group(0) @binding(0) var<storage, read> src: array<f32>;
@group(0) @binding(1) var<storage, read> ok: array<u32>;
@group(0) @binding(2) var<storage, read> map: array<f32>;
@group(0) @binding(3) var<storage, read_write> outv: array<f32>;
@group(0) @binding(4) var<storage, read_write> outok: array<u32>;
@group(0) @binding(5) var<uniform> p: P;
@compute @workgroup_size(${WG}) fn main(@builtin(global_invocation_id) g: vec3<u32>) {
  let k = g.x;
  if (k >= p.n * p.n) { return; }
  var x = map[2u * k]; var y = map[2u * k + 1u];
  let fw = f32(p.sw); let fh = f32(p.sh);
  if (!(x >= -0.5 && x <= fw - 0.5 && y >= -0.5 && y <= fh - 0.5)) { outok[k] = 0u; return; }
  x = clamp(x, 0.0, fw - 1.0); y = clamp(y, 0.0, fh - 1.0);
  let x0 = min(u32(floor(x)), p.sw - 2u); let y0 = min(u32(floor(y)), p.sh - 2u);
  let tx = x - f32(x0); let ty = y - f32(y0);
  let i00 = y0 * p.sw + x0; let i10 = i00 + 1u; let i01 = i00 + p.sw; let i11 = i01 + 1u;
  if (ok[i00] == 0u || ok[i10] == 0u || ok[i01] == 0u || ok[i11] == 0u) { outok[k] = 0u; return; }
  outv[k] = (1.0 - tx) * (1.0 - ty) * src[i00] + tx * (1.0 - ty) * src[i10] + (1.0 - tx) * ty * src[i01] + tx * ty * src[i11];
  outok[k] = 1u;
}`

const ADAPTIVE = `
struct P { sw: u32, sh: u32, n: u32, conserve: u32, kw: f32, region: f32, pad0: f32, pad1: f32 }
@group(0) @binding(0) var<storage, read> src: array<f32>;
@group(0) @binding(1) var<storage, read> ok: array<u32>;
@group(0) @binding(2) var<storage, read> map: array<f32>;
@group(0) @binding(3) var<storage, read_write> outv: array<f32>;
@group(0) @binding(4) var<storage, read_write> outok: array<u32>;
@group(0) @binding(5) var<uniform> p: P;
fn P2(j: u32, i: u32, c: u32) -> f32 { let m = p.n + 2u; return map[2u * (j * m + i) + c]; }
@compute @workgroup_size(${WG}) fn main(@builtin(global_invocation_id) g: vec3<u32>) {
  let k = g.x;
  if (k >= p.n * p.n) { return; }
  let yi = k / p.n; let xi = k % p.n;
  let j00 = ((-P2(yi + 1u, xi, 0u) + P2(yi + 1u, xi + 1u, 0u)) + (-P2(yi + 1u, xi + 1u, 0u) + P2(yi + 1u, xi + 2u, 0u))) / 2.0;
  let j10 = ((-P2(yi + 1u, xi, 1u) + P2(yi + 1u, xi + 1u, 1u)) + (-P2(yi + 1u, xi + 1u, 1u) + P2(yi + 1u, xi + 2u, 1u))) / 2.0;
  let j01 = ((-P2(yi, xi + 1u, 0u) + P2(yi + 1u, xi + 1u, 0u)) + (-P2(yi + 1u, xi + 1u, 0u) + P2(yi + 2u, xi + 1u, 0u))) / 2.0;
  let j11 = ((-P2(yi, xi + 1u, 1u) + P2(yi + 1u, xi + 1u, 1u)) + (-P2(yi + 1u, xi + 1u, 1u) + P2(yi + 2u, xi + 1u, 1u))) / 2.0;
  let px = P2(yi + 1u, xi + 1u, 0u); let py = P2(yi + 1u, xi + 1u, 1u);
  let E = (j00 + j11) / 2.0; let F = (j00 - j11) / 2.0; let G = (j10 + j01) / 2.0; let H = (j10 - j01) / 2.0;
  let Q = sqrt(E * E + H * H); let R = sqrt(F * F + G * G);
  let s0 = max(1.0, Q + R); let s1 = max(1.0, Q - R);
  let a1 = atan2(G, F); let a2 = atan2(H, E); let th = (a2 - a1) / 2.0; let ph = (a2 + a1) / 2.0;
  let U = vec4<f32>(cos(ph), -sin(ph), sin(ph), cos(ph)); let V = vec4<f32>(cos(th), sin(th), -sin(th), cos(th));
  let i0 = 1.0 / s0; let i1 = 1.0 / s1;
  let t00 = V.x * i0; let t01 = V.y * i1; let t10 = V.z * i0; let t11 = V.w * i1;
  let J = vec4<f32>(t00 * U.x + t01 * U.y, t00 * U.z + t01 * U.w, t10 * U.x + t11 * U.y, t10 * U.z + t11 * U.w);
  let top0 = p.region / (2.0 * min(i0, i1));
  let top = i32(floor(top0 + py)); let bottom = i32(ceil(-top0 + py));
  let right = i32(floor(top0 + px)); let left = i32(ceil(-top0 + px));
  if (right > i32(p.sw) - 1 || left < 0 || top > i32(p.sh) - 1 || bottom < 0) { outok[k] = 0u; return; }
  var acc = 0.0; var wsum = 0.0; var bad = false;
  for (var y = bottom; y <= top; y++) {
    let oy = f32(y) - py; var sampled = false;
    for (var x = left; x <= right; x++) {
      let ox = f32(x) - px;
      let a = J.x * ox + J.y * oy; let b = J.z * ox + J.w * oy;
      let w = exp(-(a * a + b * b) / (p.kw * p.kw) * 2.0);
      if (w == 0.0) { if (sampled) { break; } continue; }
      sampled = true;
      let idx = u32(y) * p.sw + u32(x);
      if (ok[idx] == 0u) { bad = true; }
      acc += w * src[idx]; wsum += w;
    }
  }
  if (bad || !(wsum > 0.0)) { outok[k] = 0u; return; }
  var v = acc / wsum;
  if (p.conserve != 0u) { v = v * abs(j00 * j11 - j01 * j10); }
  outv[k] = v; outok[k] = 1u;
}`

export async function createGpu() {
  if (!globalThis.navigator?.gpu) throw new Error('WebGPU is not available in this browser')
  const adapter = await navigator.gpu.requestAdapter()
  if (!adapter) throw new Error('no WebGPU adapter')
  const device = await adapter.requestDevice()
  const mk = code => device.createComputePipeline({ layout: 'auto', compute: { module: device.createShaderModule({ code }), entryPoint: 'main' } })
  const pipes = { bilinear: mk(BILINEAR), adaptive: mk(ADAPTIVE) }
  const info = adapter.info || {}
  async function run(kind, src, sw, sh, mapF64, n, params) {
    const N = n * n
    const srcF = new Float32Array(src.length), okA = new Uint32Array(src.length)
    for (let k = 0; k < src.length; k++) { const v = src[k]; if (Number.isFinite(v)) { srcF[k] = v; okA[k] = 1 } }
    const mapF = Float32Array.from(mapF64)
    const buf = (data, usage) => { const b = device.createBuffer({ size: Math.max(16, data.byteLength), usage, mappedAtCreation: true }); new data.constructor(b.getMappedRange()).set(data); b.unmap(); return b }
    const S = GPUBufferUsage.STORAGE, C = GPUBufferUsage.COPY_SRC, D = GPUBufferUsage.COPY_DST
    const bSrc = buf(srcF, S), bOk = buf(okA, S), bMap = buf(mapF, S)
    const bOut = device.createBuffer({ size: N * 4, usage: S | C }), bOutOk = device.createBuffer({ size: N * 4, usage: S | C })
    const u = kind === 'bilinear' ? new Uint32Array([sw, sh, n, 0]) : (() => { const a = new ArrayBuffer(32), dv = new DataView(a); dv.setUint32(0, sw, true); dv.setUint32(4, sh, true); dv.setUint32(8, n, true); dv.setUint32(12, params.conserveFlux ? 1 : 0, true); dv.setFloat32(16, params.kernelWidth ?? 1.3, true); dv.setFloat32(20, params.sampleRegionWidth ?? 4, true); return new Uint32Array(a) })()
    const bU = buf(u, GPUBufferUsage.UNIFORM)
    const pipe = pipes[kind]
    const bg = device.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [bSrc, bOk, bMap, bOut, bOutOk, bU].map((b, i) => ({ binding: i, resource: { buffer: b } })) })
    const rb1 = device.createBuffer({ size: N * 4, usage: GPUBufferUsage.MAP_READ | D }), rb2 = device.createBuffer({ size: N * 4, usage: GPUBufferUsage.MAP_READ | D })
    const enc = device.createCommandEncoder(), pass = enc.beginComputePass()
    pass.setPipeline(pipe); pass.setBindGroup(0, bg); pass.dispatchWorkgroups(Math.ceil(N / WG)); pass.end()
    enc.copyBufferToBuffer(bOut, 0, rb1, 0, N * 4); enc.copyBufferToBuffer(bOutOk, 0, rb2, 0, N * 4)
    device.queue.submit([enc.finish()])
    await Promise.all([rb1.mapAsync(GPUMapMode.READ), rb2.mapAsync(GPUMapMode.READ)])
    const v = new Float32Array(rb1.getMappedRange().slice(0)), okO = new Uint32Array(rb2.getMappedRange().slice(0))
    rb1.unmap(); rb2.unmap()
    for (const b of [bSrc, bOk, bMap, bOut, bOutOk, bU, rb1, rb2]) b.destroy()
    for (let k = 0; k < N; k++) if (!okO[k]) v[k] = NaN
    return v
  }
  return {
    info: { vendor: info.vendor, architecture: info.architecture, description: info.description, isFallbackAdapter: adapter.isFallbackAdapter },
    bilinear: (src, sw, sh, map, n) => run('bilinear', src, sw, sh, map, n, {}),
    adaptive: (src, sw, sh, mapPad, n, opts = {}) => run('adaptive', src, sw, sh, mapPad, n, opts),
  }
}
