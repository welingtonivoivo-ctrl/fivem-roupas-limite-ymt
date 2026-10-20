// Junta várias coleções de roupa (.ymt) de um gênero numa só, renumerando peças e arquivos.
// Uso: node fusao.cjs <config.json>
// config: { ped, pasta_ymt, lista_arquivos, molde, saida, grupos: { novoNome: [colecoes...] }, pular: { colecao: { comp: [idx] , props: { ancora: [idx] } } } }
const fs = require('fs')
const path = require('path')
const io = require('./ymtio.cjs')

const COMP = ['head', 'berd', 'hair', 'uppr', 'lowr', 'hand', 'feet', 'teef', 'accs', 'task', 'decl', 'jbib']
const PROP = ['p_head', 'p_eyes', 'p_ears', 'p_mouth', 'p_lhand', 'p_rhand', 'p_lwrist', 'p_rwrist', 'p_hip', 'p_lfoot', 'p_rfoot', 'p_ph_l_hand', 'p_ph_r_hand']
const pad = (n) => String(n).padStart(3, '0')

const cfg = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
const { ped } = cfg
const arquivos = fs.readFileSync(cfg.lista_arquivos, 'utf8').split(/\r?\n/).map((l) => l.split('|')[0]).filter(Boolean)
const molde = io.read(fs.readFileSync(path.join(cfg.pasta_ymt, `${ped}_${cfg.molde}.ymt`))).tpl
fs.mkdirSync(cfg.saida, { recursive: true })

const mapa = [] // [antigo, novo]
const relatorio = []

for (const [novo, colecoes] of Object.entries(cfg.grupos)) {
  const comps = COMP.map(() => ({ draws: [], infos: [] }))
  const props = PROP.map(() => [])
  const flags = { tex: false, draw: false }
  for (const col of colecoes) {
    const r = io.read(fs.readFileSync(path.join(cfg.pasta_ymt, `${ped}_${col}.ymt`))).root
    flags.tex ||= !!r.bHasTexVariations
    flags.draw ||= !!r.bHasDrawblVariations
    const pular = (cfg.pular && cfg.pular[col]) || {}
    const pre = `${ped}_${col}^`
    const ppre = `${ped}_p_${col}^`
    r.availComp.forEach((idx, c) => {
      if (idx === 255) return
      if ((pular.comp || []).includes(COMP[c])) return // componente inteiro fora (ex.: cabeça sem modelo)
      const skip = (pular[COMP[c]] || [])
      const novoIdx = new Map()
      r.aComponentData3[idx].aDrawblData3.forEach((d, n) => {
        if (skip.includes(n)) return
        const ni = comps[c].draws.length
        novoIdx.set(n, ni)
        comps[c].draws.push(d)
        // arquivos da peça: modelo (+ alternativos) e texturas
        const re = new RegExp('^' + esc(pre + COMP[c] + '_') + '(' + pad(n) + ')(_[a-z](?:_\\d+)?\\.ydd)$|^' + esc(pre + COMP[c] + '_diff_') + '(' + pad(n) + ')(_[a-z]_[a-z]+\\.ytd)$', 'i')
        for (const a of arquivos) {
          const m = a.match(re)
          if (!m) continue
          const resto = m[2] ? COMP[c] + '_' + pad(ni) + m[2] : COMP[c] + '_diff_' + pad(ni) + m[4]
          mapa.push([a, `${ped}_${novo}^${resto}`])
        }
      })
      for (const ci of r.compInfos.filter((x) => x.pedXml_compIdx === c)) {
        if (!novoIdx.has(ci.pedXml_drawblIdx)) continue
        comps[c].infos.push({ ...ci, pedXml_drawblIdx: novoIdx.get(ci.pedXml_drawblIdx) })
      }
    })
    const pskip = (pular.props || {})
    for (const p of r.propInfo.aPropMetaData) {
      if ((pskip[PROP[p.anchorId]] || []).includes(p.propId)) continue
      const ni = props[p.anchorId].length
      props[p.anchorId].push({ ...p, propId: ni })
      const a0 = PROP[p.anchorId]
      const re = new RegExp('^' + esc(ppre + a0 + '_') + '(' + pad(p.propId) + ')(\\.ydd)$|^' + esc(ppre + a0 + '_diff_') + '(' + pad(p.propId) + ')(_[a-z]\\.ytd)$', 'i')
      for (const a of arquivos) {
        const m = a.match(re)
        if (!m) continue
        const resto = m[2] ? a0 + '_' + pad(ni) + m[2] : a0 + '_diff_' + pad(ni) + m[4]
        mapa.push([a, `${ped}_p_${novo}^${resto}`])
      }
    }
  }

  const availComp = []
  const aComponentData3 = []
  let compInfos = []
  comps.forEach((c, i) => {
    if (!c.draws.length) { availComp.push(255); return }
    if (c.draws.length > 255) throw new Error(`${novo}: ${COMP[i]} passou de 255 peças (${c.draws.length})`)
    availComp.push(aComponentData3.length)
    const tex = c.draws.reduce((s, d) => s + d.aTexData.length, 0)
    aComponentData3.push({ numAvailTex: tex & 0xFF, aDrawblData3: c.draws })
    compInfos = compInfos.concat(c.infos.sort((a, b) => a.pedXml_drawblIdx - b.pedXml_drawblIdx))
    relatorio.push(`${novo} ${COMP[i]}: ${c.draws.length} peças, ${tex} texturas`)
  })
  const aPropMetaData = []
  const aAnchors = []
  props.forEach((lista, anc) => {
    if (!lista.length) return
    aPropMetaData.push(...lista)
    aAnchors.push({ props: lista.map((p) => p.texData.length), anchor: anc })
    relatorio.push(`${novo} ${PROP[anc]}: ${lista.length} props`)
  })
  const root = {
    bHasTexVariations: flags.tex ? 1 : 0,
    bHasDrawblVariations: flags.draw ? 1 : 0,
    bHasLowLODs: 0,
    bIsSuperLOD: 0,
    availComp,
    aComponentData3,
    aSelectionSets: [],
    compInfos,
    propInfo: { numAvailProps: aPropMetaData.length & 0xFF, aPropMetaData, aAnchors },
    dlcName: io.joaat(novo),
  }
  fs.writeFileSync(path.join(cfg.saida, `${ped}_${novo}.ymt`), io.write(molde, root, novo))
  fs.writeFileSync(path.join(cfg.saida, `${ped}_${novo}.meta`), `<?xml version="1.0" encoding="UTF-8"?>
<ShopPedApparel>
\t<pedName>${ped}</pedName>
\t<dlcName>${novo}</dlcName>
\t<fullDlcName>${ped}_${novo}</fullDlcName>
\t<eCharacter>SCR_CHAR_MULTIPLAYER</eCharacter>
\t<pedOutfits>
\t</pedOutfits>
\t<pedComponents>
\t</pedComponents>
\t<pedProps>
\t</pedProps>
</ShopPedApparel>
`)
}

const destinos = new Set()
for (const [, n] of mapa) { if (destinos.has(n.toLowerCase())) throw new Error('destino repetido: ' + n); destinos.add(n.toLowerCase()) }
fs.writeFileSync(path.join(cfg.saida, 'mapa.csv'), mapa.map((m) => m.join('|')).join('\n'))
fs.writeFileSync(path.join(cfg.saida, 'relatorio.txt'), relatorio.join('\n'))
console.log(relatorio.join('\n'))
console.log('arquivos renomeados:', mapa.length)

function esc (s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }
