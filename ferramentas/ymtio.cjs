// Leitura e escrita de .ymt de roupa (RSC7 Meta, CPedVariationInfo) sem perder campos.
// read(buf) -> { tpl, structs, root }  (valores crus: hashes como número)
// write(tpl, root) -> buf .ymt (RSC7 comprimido)
const zlib = require('zlib')

const SYS = 0x50000000
const joaat = (s) => { s = s.toLowerCase(); let h = 0; for (let i = 0; i < s.length; i++) { h = (h + s.charCodeAt(i)) >>> 0; h = (h + (h << 10)) >>> 0; h = (h ^ (h >>> 6)) >>> 0 } h = (h + (h << 3)) >>> 0; h = (h ^ (h >>> 11)) >>> 0; h = (h + (h << 15)) >>> 0; return h }
const joaatCs = (s) => { let h = 0; for (let i = 0; i < s.length; i++) { h = (h + s.charCodeAt(i)) >>> 0; h = (h + (h << 10)) >>> 0; h = (h ^ (h >>> 6)) >>> 0 } h = (h + (h << 3)) >>> 0; h = (h ^ (h >>> 11)) >>> 0; h = (h + (h << 15)) >>> 0; return h }
const F = {}
for (const n of 'bHasTexVariations,bHasDrawblVariations,bHasLowLODs,bIsSuperLOD,availComp,aComponentData3,aSelectionSets,compInfos,propInfo,dlcName,numAvailTex,aDrawblData3,propMask,numAlternatives,aTexData,clothData,texId,distribution,ownsCloth,pedXml_audioID,pedXml_audioID2,pedXml_expressionMods,flags,inclusions,exclusions,pedXml_vfxComps,pedXml_flags,pedXml_compIdx,pedXml_drawblIdx,numAvailProps,aPropMetaData,aAnchors,audioId,expressionMods,texData,renderFlags,propFlags,anchorId,propId,stickyness,inclusionId,exclusionId,props,anchor'.split(',')) F[joaatCs(n)] = n
const NAME = (h) => F[h] || ('#' + h.toString(16))
const HASH = (n) => n.startsWith('#') ? parseInt(n.slice(1), 16) : joaatCs(n)

function unpack (file) {
  if (file.toString('latin1', 0, 4) !== 'RSC7') throw new Error('não é RSC7')
  return zlib.inflateRawSync(file.subarray(16))
}

function read (file) {
  const b = unpack(file)
  const ptr = (o) => { const lo = b.readUInt32LE(o); return lo ? lo - SYS : null }
  const sInfoP = ptr(0x20), dbP = ptr(0x30)
  const sCount = b.readInt16LE(0x48), dbCount = b.readInt16LE(0x4C)
  const structs = {}
  for (let i = 0; i < sCount; i++) {
    const o = sInfoP + i * 0x20
    const hash = b.readUInt32LE(o), entP = ptr(o + 0x10), size = b.readInt32LE(o + 0x18), n = b.readInt16LE(o + 0x1E)
    const entries = []
    for (let j = 0; j < n; j++) { const e = entP + j * 16; entries.push({ hash: b.readUInt32LE(e), off: b.readInt32LE(e + 4), type: b.readUInt8(e + 8), refIdx: b.readInt16LE(e + 10), refKey: b.readUInt32LE(e + 12) }) }
    structs[hash] = { size, entries }
  }
  const blocks = []
  let firstData = Infinity
  for (let i = 0; i < dbCount; i++) { const o = dbP + i * 16; const blk = { hash: b.readUInt32LE(o), len: b.readInt32LE(o + 4), p: ptr(o + 8) }; blocks.push(blk); firstData = Math.min(firstData, blk.p) }
  const at = (p) => { const bi = (p & 0xFFF) - 1, off = (p >>> 12) & 0xFFFFF; return blocks[bi].p + off }
  const val = (o, e, st) => {
    switch (e.type) {
      case 0x01: case 0x11: return b.readUInt8(o)
      case 0x10: return b.readInt8(o)
      case 0x12: return b.readInt16LE(o)
      case 0x13: case 0x64: return b.readUInt16LE(o)
      case 0x14: case 0x62: case 0x63: case 0x65: return b.readInt32LE(o)
      case 0x15: case 0x4A: return b.readUInt32LE(o)
      case 0x21: return b.readFloatLE(o)
      case 0x05: return obj(o, e.refKey)
      case 0x50: return [...b.subarray(o, o + (e.refKey & 0xFFFF))]
      case 0x52: {
        const p = b.readUInt32LE(o), cnt = b.readUInt16LE(o + 8)
        if (!cnt) return []
        const el = st.entries[e.refIdx], base = at(p), es = size(el, structs)
        const out = []
        for (let i = 0; i < cnt; i++) out.push(val(base + i * es, el, st))
        return out
      }
    }
    throw new Error('tipo não suportado 0x' + e.type.toString(16))
  }
  const obj = (o, hash) => {
    const st = structs[hash], r = {}
    for (const e of st.entries) if (e.hash !== 0x100) r[NAME(e.hash)] = val(o + e.off, e, st)
    return r
  }
  const rootBlk = blocks[b.readInt32LE(0x1C) - 1]
  // tudo antes do primeiro bloco de dados (cabeçalho, infos de estrutura e enum) é reaproveitado como molde
  const tpl = { head: b.subarray(0, Math.min(firstData, dbP)), rootHash: rootBlk.hash, structs, blockOrder: blocks.map((x) => x.hash) }
  return { tpl, root: obj(rootBlk.p, rootBlk.hash) }
}

function size (e, structs) {
  switch (e.type) {
    case 0x01: case 0x10: case 0x11: return 1
    case 0x12: case 0x13: case 0x64: return 2
    case 0x05: return structs[e.refKey].size
    case 0x52: return 16
    default: return 4
  }
}

function write (tpl, root, name) {
  const { structs } = tpl
  const order = tpl.blockOrder.slice()
  const blocks = new Map() // hash -> { parts: Buffer[], len }
  for (const h of order) blocks.set(h, { parts: [], len: 0 })
  const blockIdx = (h) => { if (!blocks.has(h)) { blocks.set(h, { parts: [], len: 0 }); order.push(h) } return order.indexOf(h) }
  const alloc = (h, n, align) => {
    const blk = blocks.get(h) || (blockIdx(h), blocks.get(h))
    const padN = (align - (blk.len % align)) % align
    if (padN) { blk.parts.push(Buffer.alloc(padN)); blk.len += padN }
    const off = blk.len, buf = Buffer.alloc(n)
    blk.parts.push(buf); blk.len += n
    return { buf, off, ptr: ((blockIdx(h) + 1) | (off << 12)) >>> 0 }
  }
  const elemHash = (e) => e.type === 0x05 ? e.refKey : e.type // blocos de primitivos usam o código do tipo
  const put = (buf, o, e, st, v) => {
    switch (e.type) {
      case 0x01: case 0x11: buf.writeUInt8(v & 0xFF, o); return
      case 0x10: buf.writeInt8(v, o); return
      case 0x12: buf.writeInt16LE(v, o); return
      case 0x13: case 0x64: buf.writeUInt16LE(v, o); return
      case 0x14: case 0x62: case 0x63: case 0x65: buf.writeInt32LE(v, o); return
      case 0x15: case 0x4A: buf.writeUInt32LE(v >>> 0, o); return
      case 0x21: buf.writeFloatLE(v, o); return
      case 0x05: fill(buf, o, e.refKey, v); return
      case 0x50: for (let i = 0; i < (e.refKey & 0xFFFF); i++) buf.writeUInt8(v[i] || 0, o + i); return
      case 0x52: {
        if (!v.length) return
        const el = st.entries[e.refIdx], es = size(el, structs)
        const a = alloc(elemHash(el), es * v.length, el.type === 0x05 ? 16 : Math.min(es, 16))
        v.forEach((item, i) => put(a.buf, i * es, el, st, item))
        buf.writeUInt32LE(a.ptr, o); buf.writeUInt32LE(0, o + 4)
        buf.writeUInt16LE(v.length, o + 8); buf.writeUInt16LE(v.length, o + 10)
        return
      }
    }
    throw new Error('tipo não suportado 0x' + e.type.toString(16))
  }
  const fill = (buf, o, hash, v) => {
    const st = structs[hash]
    for (const e of st.entries) if (e.hash !== 0x100) put(buf, o + e.off, e, st, v[NAME(e.hash)])
  }
  const rootA = alloc(tpl.rootHash, structs[tpl.rootHash].size, 16)
  fill(rootA.buf, 0, tpl.rootHash, root)

  // monta o arquivo: molde + blocos + tabela de blocos + nome
  const used = order.filter((h) => blocks.get(h).len)
  const parts = [Buffer.from(tpl.head)]
  let len = tpl.head.length
  const pad16 = () => { const n = (16 - (len % 16)) % 16; if (n) { parts.push(Buffer.alloc(n)); len += n } }
  const table = []
  // reindexa: blocos vazios saem, ponteiros precisam do índice final
  const remap = new Map(used.map((h, i) => [order.indexOf(h) + 1, i + 1]))
  for (const h of used) {
    pad16()
    const blk = blocks.get(h)
    const data = Buffer.concat(blk.parts)
    table.push({ hash: h, len: data.length, off: len })
    parts.push(data); len += data.length
  }
  const all = () => Buffer.concat(parts)
  pad16()
  const tableOff = len
  const tb = Buffer.alloc(table.length * 16)
  table.forEach((t, i) => { tb.writeUInt32LE(t.hash, i * 16); tb.writeInt32LE(t.len, i * 16 + 4); tb.writeUInt32LE(SYS + t.off, i * 16 + 8); tb.writeUInt32LE(0, i * 16 + 12) })
  parts.push(tb); len += tb.length
  pad16()
  const nameOff = len
  const nb = Buffer.from(name + '\0', 'latin1')
  parts.push(nb); len += nb.length
  pad16()
  // PagesInfo próprio no fim (o do molde pode ter ficado fora da região copiada)
  const pagesOff = len
  const pi = Buffer.alloc(0x20)
  pi.writeUInt8(1, 8)
  parts.push(pi); len += pi.length
  let out = all()
  out.writeUInt32LE(SYS + pagesOff, 0x08); out.writeUInt32LE(0, 0x0C)
  // corrige os ponteiros de array (índice de bloco) dentro dos dados
  fixPointers(out, table, structs, remap, tpl.rootHash)
  out.writeUInt32LE(SYS + tableOff, 0x30); out.writeUInt32LE(0, 0x34)
  out.writeUInt32LE(SYS + nameOff, 0x38); out.writeUInt32LE(0, 0x3C)
  out.writeInt16LE(table.length, 0x4C)
  out.writeInt32LE(remap.get(order.indexOf(tpl.rootHash) + 1), 0x1C)
  // uma página de sistema só, do tamanho da maior potência de 2 necessária
  let ss = 0
  while ((0x200 << ss) < out.length) ss++
  if (ss > 15) throw new Error('ymt grande demais')
  const page = Buffer.alloc(0x200 << ss)
  out.copy(page)
  const head = Buffer.alloc(16)
  head.write('RSC7', 0, 'latin1'); head.writeUInt32LE(2, 4)
  head.writeUInt32LE((0x08000000 | ss) >>> 0, 8); head.writeUInt32LE(0x20000000, 12)
  return Buffer.concat([head, zlib.deflateRawSync(page, { level: 9 })])
}

// percorre os dados de novo a partir da raiz e troca o índice de bloco de cada ponteiro de array
function fixPointers (buf, table, structs, remap, rootHash) {
  const blockAt = (p) => { const bi = remap.get(p & 0xFFF); return { bi, off: (p >>> 12) & 0xFFFFF } }
  const seen = new Set()
  const walk = (o, hash) => {
    const st = structs[hash]
    for (const e of st.entries) {
      if (e.hash === 0x100) continue
      if (e.type === 0x05) walk(o + e.off, e.refKey)
      if (e.type === 0x52) {
        const p = buf.readUInt32LE(o + e.off), cnt = buf.readUInt16LE(o + e.off + 8)
        if (!cnt || seen.has(o + e.off)) continue
        seen.add(o + e.off)
        const { bi, off } = blockAt(p)
        buf.writeUInt32LE((bi | (off << 12)) >>> 0, o + e.off)
        const el = st.entries[e.refIdx]
        if (el.type === 0x05) {
          const base = table[bi - 1].off + off, es = structs[el.refKey].size
          for (let i = 0; i < cnt; i++) walk(base + i * es, el.refKey)
        }
      }
    }
  }
  const rootIdx = table.findIndex((t) => t.hash === rootHash)
  walk(table[rootIdx].off, rootHash)
}

module.exports = { read, write, unpack, joaat, joaatCs, NAME, HASH }
