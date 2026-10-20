// Verificador de coleções de roupa: node checar.cjs <pasta com os .ymt> <lista de arquivos do stream (nome|tamanho por linha)> <ped>
const fs = require('fs')
const path = require('path')
const io = require('./ymtio.cjs')
const [dir, lista, ped] = process.argv.slice(2)
const COMP = ['head', 'berd', 'hair', 'uppr', 'lowr', 'hand', 'feet', 'teef', 'accs', 'task', 'decl', 'jbib']
const PROP = ['p_head', 'p_eyes', 'p_ears', 'p_mouth', 'p_lhand', 'p_rhand', 'p_lwrist', 'p_rwrist', 'p_hip', 'p_lfoot', 'p_rfoot', 'p_ph_l_hand', 'p_ph_r_hand']
const files = new Map()
for (const l of fs.readFileSync(lista, 'utf8').split(/\r?\n/)) { const [n, s] = l.split('|'); if (n) files.set(n.toLowerCase(), +s) }
const joaat = (s) => { s = s.toLowerCase(); let h = 0; for (let i = 0; i < s.length; i++) { h = (h + s.charCodeAt(i)) >>> 0; h = (h + (h << 10)) >>> 0; h = (h ^ (h >>> 6)) >>> 0 } h = (h + (h << 3)) >>> 0; h = (h ^ (h >>> 11)) >>> 0; h = (h + (h << 15)) >>> 0; return h }
const pad = (n) => String(n).padStart(3, '0')
const L = (t) => String.fromCharCode(97 + t)
const has = (re) => [...files.keys()].filter((k) => re.test(k))

for (const f of fs.readdirSync(dir).filter((f) => f.startsWith(ped + '_') && f.endsWith('.ymt'))) {
  const col = f.slice(ped.length + 1, -'.ymt'.length)
  const j = io.read(fs.readFileSync(path.join(dir, f))).root
  const pre = `${ped}_${col}^`.toLowerCase()
  const ppre = `${ped}_p_${col}^`.toLowerCase()
  const erros = []
  const avisos = []
  if (j.dlcName !== joaat(col)) avisos.push(`dlcName ${j.dlcName} não bate com ${col}`)
  const used = new Set()
  j.availComp.forEach((idx, c) => {
    if (idx === 255) return
    if (idx >= j.aComponentData3.length) { erros.push(`availComp[${COMP[c]}] aponta para ${idx}, só existem ${j.aComponentData3.length}`); return }
    if (used.has(idx)) erros.push(`availComp: índice ${idx} usado por 2 componentes`)
    used.add(idx)
    const cd = j.aComponentData3[idx]
    let totalTex = 0
    cd.aDrawblData3.forEach((d, n) => {
      totalTex += d.aTexData.length
      if (!d.aTexData.length) erros.push(`${COMP[c]} ${n}: sem nenhuma textura`)
      const m = has(new RegExp('^' + esc(pre + COMP[c] + '_' + pad(n) + '_') + '[a-z]\\.ydd$'))
      if (!m.length) erros.push(`${COMP[c]} ${n}: falta o modelo (.ydd)`)
      for (const x of m) { const s = files.get(x); if (s > 16 * 1024 * 1024) avisos.push(`${x} tem ${(s / 1048576).toFixed(1)} MB (>16 MB)`) }
      // a letra da textura é a posição na lista; texId é o tom de pele (uni, whi...)
      if (d.aTexData.length > 26) erros.push(`${COMP[c]} ${n}: ${d.aTexData.length} texturas (máximo 26)`)
      d.aTexData.forEach((t, i) => {
        const tx = has(new RegExp('^' + esc(pre + COMP[c] + '_diff_' + pad(n) + '_' + L(i)) + '_[a-z]+\\.ytd$'))
        if (!tx.length) avisos.push(`${COMP[c]} ${n}: falta textura ${L(i)}`)
      })
    })
    if (cd.numAvailTex !== totalTex) avisos.push(`${COMP[c]}: numAvailTex ${cd.numAvailTex} ≠ ${totalTex} texturas listadas`)
  })
  if (used.size !== j.aComponentData3.length) erros.push(`aComponentData3 tem ${j.aComponentData3.length} itens, availComp usa ${used.size}`)
  for (const ci of j.compInfos) {
    const idx = j.availComp[ci.pedXml_compIdx]
    if (idx === undefined || idx === 255) { erros.push(`compInfos: componente ${COMP[ci.pedXml_compIdx] ?? ci.pedXml_compIdx} não existe na coleção`); continue }
    if (ci.pedXml_drawblIdx >= j.aComponentData3[idx].aDrawblData3.length) erros.push(`compInfos: ${COMP[ci.pedXml_compIdx]} ${ci.pedXml_drawblIdx} não existe`)
  }
  const nDraw = j.aComponentData3.reduce((a, c) => a + c.aDrawblData3.length, 0)
  if (j.compInfos.length !== nDraw) avisos.push(`compInfos tem ${j.compInfos.length}, peças ${nDraw}`)
  const pi = j.propInfo
  const cont = {}
  for (const p of pi.aPropMetaData) {
    const a = PROP[p.anchorId] || ('anchor' + p.anchorId)
    const m = has(new RegExp('^' + esc(ppre + a + '_' + pad(p.propId)) + '\\.ydd$'))
    if (!m.length) erros.push(`prop ${a} ${p.propId}: falta o modelo`)
    cont[p.anchorId] = (cont[p.anchorId] || 0) + 1
    p.texData.forEach((t, i) => {
      const tx = has(new RegExp('^' + esc(ppre + a + '_diff_' + pad(p.propId) + '_' + L(i)) + '(_[a-z]+)?\\.ytd$'))
      if (!tx.length) avisos.push(`prop ${a} ${p.propId}: falta textura ${L(i)}`)
    })
  }
  if (pi.numAvailProps !== (pi.aPropMetaData.length & 0xFF)) erros.push(`numAvailProps ${pi.numAvailProps} ≠ ${pi.aPropMetaData.length}`)
  // aAnchors[].props = quantas texturas cada prop daquela âncora tem, na ordem
  for (const an of pi.aAnchors) {
    if ((cont[an.anchor] || 0) !== an.props.length) erros.push(`âncora ${PROP[an.anchor] ?? an.anchor}: lista ${an.props.length} props, a coleção tem ${cont[an.anchor] || 0}`)
  }
  console.log(`\n== ${col}: ${nDraw} peças, ${pi.aPropMetaData.length} props — ${erros.length} erros, ${avisos.length} avisos`)
  for (const e of erros.slice(0, 25)) console.log('  ERRO  ' + e)
  for (const a of avisos.slice(0, 12)) console.log('  aviso ' + a)
}
function esc (s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }
