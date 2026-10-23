---
name: fivem-roupas-limite-ymt
description: "FiveM clothing packs that break freemode ped creation (\"PACOTE DE ROUPAS QUEBRADO\", CreatePed fails for mp_m_freemode_01 / mp_f_freemode_01, game hangs building the character) because of the per-gender limit of clothing collections (.ymt, one per SHOP_PED_APPAREL_META_FILE line; about 6 on build 3751). Diagnoses by halving, counts collections per gender across all resources, merges several collections into one with Node tools (read/write RSC7 .ymt, check missing .ydd/.ytd, renumber pieces and files, generate .ymt + .meta + mapa.csv). Use when a clothing pack breaks character creation, before installing a clothing pack, or when asked to \"merge clothing collections\", \"fix the ymt limit\" (pt-BR: \"pacote de roupas quebrado\", \"CreatePed falhou\", \"não cria personagem depois do pack de roupa\", \"juntar coleções de roupa\", \"limite de ymt\", \"quantas coleções de roupa a cidade tem\")."
---

# Roupas: limite de coleções .ymt por gênero

Guia completo, tabelas e fontes: [README.md](README.md). Este arquivo é o roteiro de trabalho.

## Causa

Cada coleção addon de roupa = um `.ymt` por gênero (`CPedVariationInfo`) = uma vaga, declarada por uma linha
`data_file 'SHOP_PED_APPAREL_META_FILE'` com `mp_m_freemode_01_` ou `mp_f_freemode_01_`. Passou do limite
(cerca de 6 no b3751), o `CreatePed` quebra para **todos** os personagens daquele gênero. Quase nunca é peça
quebrada: `.ydd` faltando, head sem modelo, peles/barbas substituídas e texturas acima de 16 MB foram descartados
como causa no caso real.

## Armadilhas

- Comentar a linha `SHOP_PED_APPAREL_META_FILE` **não** descarrega a coleção: os arquivos do `stream` continuam
  carregando. Para tirar de verdade, mova também `mp_?_freemode_01_<col>^*` e `mp_?_freemode_01_p_<col>^*`.
- Uma mudança por teste.
- A fusão muda a numeração das peças do pack: roupas já salvas com elas podem mudar. Fazer logo após instalar.

## Roteiro

1. **Contar** as coleções por gênero em todos os resources de roupa (linhas `SHOP_PED_APPAREL_META_FILE`) e
   mostrar a tabela masculino/feminino: já existentes + do pack.
2. **Confirmar**: com o pack parado o personagem cria? Depois teste por metades. Se o erro acompanha a
   **quantidade** de coleções, é o limite; se acompanha uma coleção específica, é defeito nela.
   Logs: cliente `%LOCALAPPDATA%\FiveM\FiveM.app\logs\CitizenFX_log_*.log` (`CreatePed`,
   `loading SHOP_PED_APPAREL_META_FILE`); servidor `txData\default\logs\fxserver.log`.
3. **Checar** as coleções (peças sem modelo, texturas faltando, >16 MB, índices inconsistentes).
4. **Juntar** as coleções do pack em 1–2 por gênero, respeitando 255 peças por componente, 255 props e
   26 texturas por peça (passou, divide).
5. **Aplicar**: renomear os arquivos conforme `mapa.csv`, mover os antigos para backup, colocar `.ymt` e `.meta`
   gerados no resource, comentar as linhas antigas e adicionar as novas no `fxmanifest.lua`.
6. **Testar** com a cidade vazia: `ensure`, reconectar, criar personagem masculino **e** feminino, abrir a loja de
   roupas. Confirmar no log do cliente que as coleções novas carregaram.

## Ferramentas (`ferramentas/`, Node 18+, sem dependências)

Rodar a partir de uma **pasta de trabalho separada** com cópias dos `.ymt`, nunca dentro do `stream` do servidor.
Os scripts só leem e gravam arquivos locais; `fusao.cjs` grava tudo em `saida` e não renomeia nada sozinho.

```bash
# lista nome|tamanho dos arquivos do stream (PowerShell):
#   Get-ChildItem stream -Recurse -File -Filter 'mp_m_freemode_01*' | % { $_.Name + '|' + $_.Length } > arquivos_masculina.txt
node <skill>/ferramentas/checar.cjs ./ymt ./arquivos_masculina.txt mp_m_freemode_01
node <skill>/ferramentas/fusao.cjs ./fusao_masculina.json
```

- `ymtio.cjs`: lê/escreve `.ymt` RSC7 (`read(buf)` → `{ tpl, root }`, `write(tpl, root, nome)`), usado pelos outros.
- `checar.cjs <pasta_ymt> <lista> <ped>`: erros e avisos por coleção.
- `fusao.cjs <config.json>`: gera `<ped>_<novo>.ymt`, `.meta`, `mapa.csv` (antigo|novo) e `relatorio.txt`;
  aborta se dois arquivos forem para o mesmo destino.

Config (modelo em [exemplos/fusao_masculina.json](exemplos/fusao_masculina.json)):
`ped`, `pasta_ymt`, `lista_arquivos`, `molde` (coleção existente usada como base de estrutura), `saida`,
`grupos` `{ novo: [colecoes] }` e `pular` `{ colecao: { <comp>: [idx], props: { <ancora>: [idx] }, comp: [<comp>] } }`
para peças sem modelo apontadas pelo `checar.cjs`.

## Regras neste servidor

- Backup com data/hora antes de mexer (`fxmanifest.lua` e arquivos movidos). Nunca apagar: mover para backup.
- Resource de roupa tem `stream/`: **perguntar sempre** antes de `ensure`/restart, porque derruba ou crasha clientes conectados.
- "Gerou o .ymt" não é teste: o teste é criar personagem dos dois gêneros em jogo.
