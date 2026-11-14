export async function loadWasm(bytes) {
  const { instance } = await WebAssembly.instantiate(bytes, {})
  const ex = instance.exports
  const mem = () => ex.memory.buffer
  function put(arr) {
    const p = ex.alloc(arr.byteLength)
    new Uint8Array(mem(), p, arr.byteLength).set(new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength))
    return [p, arr.byteLength]
  }
  function run(inputs, outBytes, call, OutType) {
    const ptrs = inputs.map(a => (a ? put(a) : [0, 0]))
    const [po, no] = [ex.alloc(outBytes), outBytes]
    call(...ptrs.map(p => p[0]), po)
    const out = new OutType(mem().slice(po, po + no))
    for (const [p, n] of ptrs) if (p) ex.dealloc(p, n)
    ex.dealloc(po, no)
    return out
  }
  return {
    bytes: bytes.byteLength,
    coordMap(dstW, n, pad, srcW, srcSip) {
      const m = n + 2 * pad
      return run([Float64Array.from(dstW), Float64Array.from(srcW), srcSip ? Float64Array.from(srcSip) : null], m * m * 16,
        (pd, ps, psip, po) => ex.coordmap(pd, n, pad, ps, psip, po), Float64Array)
    },
    bilinear(src, sw, sh, map, n) {
      return run([src, map], n * n * 4, (ps, pm, po) => ex.bilinear(ps, sw, sh, pm, n, po), Float32Array)
    },
    adaptive(src, sw, sh, mapPad, n, { conserveFlux = false, kernelWidth = 1.3, sampleRegionWidth = 4 } = {}) {
      return run([src, mapPad], n * n * 4, (ps, pm, po) => ex.adaptive(ps, sw, sh, pm, n, conserveFlux ? 1 : 0, kernelWidth, sampleRegionWidth, po), Float32Array)
    },
  }
}
