# FiveM: "Pacote de roupas quebrado" e o limite de coleções (.ymt) por gênero

O erro em que o personagem `mp_m_freemode_01` ou `mp_f_freemode_01` não consegue ser criado depois de instalar um pack de roupa (`CreatePed` falha, o jogo trava ao montar o boneco) quase sempre **não é peça quebrada**. É o **limite de coleções de roupa por gênero** do GTA V. A correção é **juntar várias coleções numa só**, sem perder roupa.

Este repositório tem o diagnóstico, o passo a passo manual, um prompt para agentes de IA e as ferramentas (Node.js, sem dependências) usadas para corrigir um servidor real (build 3751).

## Causa raiz

Cada coleção de roupa addon traz um arquivo `.ymt` por gênero (`CPedVariationInfo`, o índice das peças) e ocupa uma "vaga". O GTA aceita poucas vagas por gênero, e as builds novas aceitam menos ainda. Passou do limite, o `CreatePed` quebra para **todos** os personagens daquele gênero.

| Item | Masculino | Feminino |
| --- | --- | --- |
| Coleções que a cidade já tinha (outros packs) | 3 | 3 ou mais |
| Coleções que o pack novo trouxe | 12 | 12 |
| Total com o pack ligado | 15 (quebrou) | 15 ou mais (quebrou) |
| Máximo que funcionou nos testes (build 3751) | 6 | não medido |
| Depois da fusão | 5 (funciona) | 5 ou mais (funciona) |

Por isso o mesmo pack funciona em outro servidor: lá ele não soma com os packs que você já tem.

## Por que falhou: o que era e o que não era

| Suspeita | Era a causa? | O que o teste mostrou |
| --- | --- | --- |
| Limite de coleções por gênero | Sim | Com 3 coleções do pack, entrou; com 4, quebrou, fosse qual fosse a coleção |
| Peças sem modelo (`.ydd` faltando) | Não | Existiam, mas só deixam a peça invisível; foram retiradas na fusão mesmo assim |
| Coleção com "cabeça" (head) sem modelo | Não | Tirada sozinha, o erro continuou |
| `mp_m_freemode_01.ymt` base substituído por outro pack | Não | Tirado, o erro continuou |
| Peles e barbas que substituem as originais | Não | Tiradas, o erro continuou |
| Texturas acima de 16 MB | Não | Só geram aviso de carregamento lento |

Duas armadilhas:

1. **Comentar a linha `data_file 'SHOP_PED_APPAREL_META_FILE'` no fxmanifest NÃO desliga a coleção.** Os arquivos na pasta `stream` continuam carregando. Para tirar de verdade, tire também os arquivos do `stream`.
2. **Uma mudança por teste.** Se duas coisas mudam juntas, o teste não diz qual resolveu.

## Como provar o problema (teste por metades)

1. Pare só o pack (`stop nome_do_pack`), reconecte e crie um personagem. Funcionou? O problema está nele.
2. Conte as coleções do gênero que quebra: cada linha `SHOP_PED_APPAREL_META_FILE` com `mp_m_freemode_01_` (ou `mp_f_freemode_01_`) em todos os resources de roupa é uma vaga.
3. Tire metade das coleções: mova `mp_m_freemode_01_<colecao>^*` e `mp_m_freemode_01_p_<colecao>^*` para um backup e comente a linha do `.meta`.
4. Com a cidade vazia: `ensure nome_do_pack`, saia, reconecte, tente criar o personagem.
5. Repita na metade com o erro. Se o erro acompanha a **quantidade** (sempre quebra a partir de N coleções, quaisquer que sejam), é o limite. Se acompanha uma coleção específica, é defeito nela.

Onde ler o resultado:

- Log do jogo: `%LOCALAPPDATA%\FiveM\FiveM.app\logs\CitizenFX_log_*.log`. Procure `CreatePed` e as linhas `loading SHOP_PED_APPAREL_META_FILE` (mostram quais coleções carregaram de fato).
- Log do servidor: `txData\default\logs\fxserver.log`, para confirmar que o `ensure` rodou.

## Correção manual (passo a passo)

Junte várias coleções numa só, por gênero. No caso real, 12 masculinas viraram 2 e 12 femininas viraram 2. Ferramentas gráficas como o grzyClothTool também fazem isso.

1. **Backup:** copie o `fxmanifest.lua` e guarde os arquivos originais de cada coleção fora do resource.
2. **Levante as coleções:** para cada `SHOP_PED_APPAREL_META_FILE`, anote o `dlcName` do `.meta` e abra o `.ymt` (`mp_m_freemode_01_<dlcName>.ymt`) no CodeWalker ou na sua ferramenta.
3. **Limites de uma coleção:** no máximo 255 peças por tipo (camisa, calça...), 255 props e 26 texturas por peça. Passou de 255? Divida em 2 coleções.
4. **Junte os índices:** por tipo de peça, as peças das coleções uma após a outra; acessórios (chapéus, óculos, brincos) por âncora, do mesmo jeito.
5. **Renomeie os arquivos com a nova numeração:** `mp_m_freemode_01_<antiga>^jbib_005_u.ydd` → `mp_m_freemode_01_<nova>^jbib_<novo>_u.ydd`; texturas `jbib_diff_005_a_uni.ytd` seguem o mesmo número; acessórios usam `mp_m_freemode_01_p_<nova>^`.
6. **Tire as peças sem modelo** (listadas no `.ymt` sem o `.ydd`).
7. **Crie o `.meta` novo** (`ShopPedApparel`: `pedName`, `dlcName` = nome novo, `fullDlcName` = `mp_m_freemode_01_<nome novo>`, `eCharacter` = `SCR_CHAR_MULTIPLAYER`). Os "metadados de criatura" antigos ficam de fora, porque os números mudaram.
8. **Atualize o fxmanifest:** comente as linhas antigas, adicione as novas e tire os arquivos antigos do `stream`.
9. **Teste com a cidade vazia:** `ensure`, reconecte, crie personagem masculino **e** feminino, abra a loja de roupas.

Efeito colateral: os números das roupas do pack mudam. Roupas já salvas com peças dele podem aparecer diferentes, então faça logo depois de instalar o pack.

## Ferramentas (pasta `ferramentas/`)

Node.js 18+, sem dependências.

| Arquivo | O que faz |
| --- | --- |
| `ymtio.cjs` | Lê e escreve `.ymt` de roupa (RSC7 Meta / `CPedVariationInfo`) sem perder campos |
| `checar.cjs` | Aponta peças e props sem modelo, texturas faltando, arquivos acima de 16 MB e índices inconsistentes |
| `fusao.cjs` | Junta coleções numa só, renumera peças e gera o `.ymt`, o `.meta` e um `mapa.csv` (nome antigo → nome novo) |

```bash
# 1) lista dos arquivos do stream (nome|tamanho por linha), ex. no PowerShell:
#    Get-ChildItem stream -Recurse -File -Filter 'mp_m_freemode_01*' | % { $_.Name + '|' + $_.Length } > arquivos_masculina.txt
# 2) verificar as coleções (pasta com os .ymt copiados do stream)
node ferramentas/checar.cjs ./ymt ./arquivos_masculina.txt mp_m_freemode_01
# 3) juntar (veja exemplos/fusao_masculina.json)
node ferramentas/fusao.cjs exemplos/fusao_masculina.json
```

A configuração da fusão:

```json
{
  "ped": "mp_m_freemode_01",
  "pasta_ymt": "./ymt",
  "lista_arquivos": "./arquivos_masculina.txt",
  "molde": "nome_de_uma_colecao_existente",
  "saida": "./saida_masculina",
  "grupos": { "nova_colecao_a": ["colecao1", "colecao2"], "nova_colecao_b": ["colecao3"] },
  "pular": { "colecao1": { "hand": [10, 12], "props": { "p_ears": [0] }, "comp": ["head"] } }
}
```

- `molde`: uma coleção existente cujo `.ymt` serve de base para as definições de estrutura.
- `pular`: peças sem modelo a deixar de fora, por componente (`hand`, `jbib`...) ou componente inteiro (`comp`).
- Depois, copie cada arquivo do `mapa.csv` para o novo nome dentro do `stream`, mova os antigos para backup, coloque os `.ymt` e `.meta` gerados no resource e ajuste o fxmanifest.

O gerador foi validado lendo e reescrevendo 22 `.ymt` reais sem diferença de conteúdo, e o resultado da fusão foi testado em jogo (masculino e feminino).

## Prompt para agente de IA

Cole num agente com acesso aos arquivos do servidor (terminal ou SSH). Troque o que está entre `< >`.

```markdown
Você vai corrigir um servidor FiveM em que criar personagem mostra "PACOTE DE ROUPAS QUEBRADO" / `CreatePed` falha no modelo mp_m_freemode_01 ou mp_f_freemode_01 depois que um pack de roupa foi instalado.

Contexto:
- Pasta dos resources: <caminho\resources>. Pack suspeito: <nome_do_pack>. Build do jogo: <ex.: 3751>.
- Log do jogo de quem testa: %LOCALAPPDATA%\FiveM\FiveM.app\logs\CitizenFX_log_*.log (procure "CreatePed" e "loading SHOP_PED_APPAREL_META_FILE").
- Causa mais provável: limite de coleções de roupa (.ymt) por gênero do GTA. Cada linha `data_file 'SHOP_PED_APPAREL_META_FILE'` de um ped freemode ocupa uma vaga; com poucas vagas (cerca de 6 no b3751), passar do limite quebra o CreatePed de todo o gênero.
- Ferramentas prontas: https://github.com/welingtonivoivo-ctrl/fivem-roupas-limite-ymt (ymtio.cjs, checar.cjs, fusao.cjs).

Regras:
- Faça backup antes de qualquer mudança (fxmanifest e arquivos movidos). Nunca apague: mova para uma pasta de backup.
- Não reinicie o servidor inteiro sozinho; peça ao dono para rodar `ensure <pack>` com a cidade vazia e reconectar.
- Uma mudança por teste. Comentar a linha do .meta NÃO descarrega a coleção: tire também os arquivos da pasta stream.
- Responda ao dono em português, um passo por mensagem.

Tarefas:
1. Conte as coleções por gênero em TODOS os resources de roupa (linhas SHOP_PED_APPAREL_META_FILE com mp_m_freemode_01_ e mp_f_freemode_01_). Mostre a tabela.
2. Confirme a causa: com o pack parado o personagem cria? Depois teste por metades e verifique se o erro acompanha a QUANTIDADE de coleções (limite) ou uma coleção específica (defeito). Confira no log do jogo quais metas carregaram em cada teste.
3. Se for o limite, junte as coleções do pack em uma ou duas por gênero:
   - Leia cada .ymt (RSC7 Meta, CPedVariationInfo: availComp, aComponentData3 > aDrawblData3 > aTexData, compInfos, propInfo > aPropMetaData/aAnchors).
   - Concatene as peças por componente (head, berd, hair, uppr, lowr, hand, feet, teef, accs, task, decl, jbib) e os props por âncora; renumere compInfos (pedXml_drawblIdx) e propId; aAnchors[].props = quantidade de texturas de cada prop, na ordem.
   - Limite por coleção: 255 peças por componente e 255 props; se passar, divida em mais de uma coleção.
   - Pule peças listadas no .ymt sem o .ydd correspondente (rode checar.cjs).
   - Renomeie os arquivos para a nova coleção e numeração: `<ped>_<col>^<comp>_<NNN>_<u|r>[_<alt>].ydd`, `<ped>_<col>^<comp>_diff_<NNN>_<letra>_<raca>.ytd`, `<ped>_p_<col>^<ancora>_<NNN>.ydd`, `<ped>_p_<col>^<ancora>_diff_<NNN>_<letra>.ytd`. Verifique que nenhum destino se repete.
   - Escreva o .ymt novo (dlcName = joaat do nome novo em minúsculas). Valide lendo de volta.
   - Crie o .meta ShopPedApparel novo, comente as linhas antigas no fxmanifest, adicione as novas e mova os arquivos antigos para backup.
4. Peça o teste: ensure, reconectar, criar personagem masculino E feminino, abrir a loja de roupas. Confirme pelo log que as coleções novas carregaram e que não há "CreatePed falhou".
5. Entregue um resumo: coleções antes/depois por gênero, peças retiradas por falta de modelo e onde estão os backups.
```

## Prevenção: antes de colocar um pack de roupa

- [ ] Contar quantas coleções masculinas e femininas o pack traz e quantas a cidade já tem.
- [ ] Se a soma passar de 5 em algum gênero, juntar o pack numa coleção fundida que já existe.
- [ ] Rodar `checar.cjs` para achar peças sem modelo e texturas acima de 16 MB.
- [ ] Testar personagem masculino **e** feminino antes de abrir a cidade.
- [ ] Preferir packs com licença: packs "dumpados" costumam vir com peças faltando.

## Fontes

- [DurtyFree – YMT game limit and crash issues](https://github.com/DurtyFree/durty-cloth-tool/wiki/YMT-game-limit-and-crash-issues)
- [Five-Forge – FiveM Clothing YMT Limit](https://five-forge.com/guides/fivem-clothing-ymt-limit)
- [Cfx Forum – SetPlayerModel crash with too many ymts](https://forum.cfx.re/t/setplayermodel-crash-when-you-have-too-much-ymts-assigned-to-a-freemode-ped-model/1934063)

## Licença

MIT. Este repositório não contém nenhum arquivo de roupa (`.ydd`, `.ytd`, `.ymt`) de terceiros.
