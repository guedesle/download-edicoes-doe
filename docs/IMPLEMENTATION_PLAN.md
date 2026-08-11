# Plano de implementação

## Estratégia

A próxima fase será entregue em incrementos pequenos, cada um utilizável e homologável. O objetivo é fechar primeiro o ciclo operacional de downloads e, em seguida, adicionar consulta e analytics sem comprometer a estabilidade do inventário atual.

## Incremento 1 — modelo e criação de lotes

Entregas:
- schema para `download_lotes` e `download_itens`;
- migração do SQLite;
- aba **Downloads**;
- seleção por edição individual, intervalo de datas e lista de números/IDs;
- seleção de tipo: normal, assinado ou ambos;
- prévia com quantidade de arquivos, páginas e volume conhecido;
- criação do lote em estado `draft/queued`.

Aceite:
- nenhum arquivo é baixado antes da confirmação;
- itens do lote correspondem exatamente ao filtro selecionado;
- links ausentes são identificados antes da execução.

## Incremento 2 — motor de execução

Entregas:
- integração com `chrome.downloads`;
- execução persistente fora do ciclo de vida do popup;
- progresso por lote e item;
- cancelamento;
- retry de falhas;
- política de nomes e subpastas;
- registro de resultado no SQLite.

Aceite:
- fechar o popup não interrompe o lote;
- lote parcial mantém itens concluídos;
- retry não baixa novamente itens concluídos;
- falhas ficam auditáveis.

## Incremento 3 — pausa, retomada e resiliência

Entregas:
- pausa/retomada quando suportada;
- recuperação de estado após reinício do service worker;
- reconciliação com `chrome.downloads.search`;
- limites conservadores de concorrência;
- tratamento de sessão expirada e arquivos indisponíveis.

Aceite:
- reinício do service worker não perde histórico;
- estados impossíveis são reconciliados ao abrir a extensão.

## Incremento 4 — Consulta

Entregas:
- aba **Consulta**;
- filtros por período, edição, tipo, suplemento e disponibilidade;
- paginação local;
- colunas configuráveis;
- links clicáveis;
- exportação CSV e Excel;
- totais do filtro atual.

Aceite:
- consultas não alteram dados;
- exportações reproduzem exatamente o filtro aplicado.

## Incremento 5 — Analytics

Entregas:
- aba **Analytics**;
- KPIs de edições, páginas, arquivos e armazenamento;
- séries mensais/anuais;
- distribuição de páginas e tamanhos;
- qualidade dos dados;
- comparação entre períodos.

Aceite:
- todos os KPIs devem ser reproduzíveis por SQL documentado;
- filtros aplicados aos gráficos devem ser visíveis.

## Incremento 6 — Data science

Entregas iniciais:
- detecção de outliers de páginas e tamanho;
- tendência temporal;
- sazonalidade exploratória;
- projeções de crescimento de armazenamento com intervalos claramente identificados como estimativas.

Não incluir modelos preditivos em decisões operacionais até haver validação histórica suficiente.

## Homologação por fluxo

Para cada incremento executar:
1. `npm test`;
2. `npm run build`;
3. recarregar `dist` no Chrome;
4. testar com sessão autenticada;
5. registrar cenários felizes e de falha;
6. verificar persistência após fechar/reabrir popup;
7. só então promover o PR para revisão.
