# Projeto executivo — Download de Edições DOE

Este diretório concentra a visão de produto, arquitetura, modelo de dados, roadmap e critérios de implementação da próxima fase da extensão.

## Objetivo

Evoluir a extensão de uma ferramenta de inventário e captura para uma plataforma local de operação e análise do acervo do DOE, com quatro capacidades integradas:

1. inventariar edições e metadados no SQLite/OPFS;
2. capturar links e tamanhos dos arquivos disponíveis no EGBANET;
3. montar e executar lotes de downloads sob demanda para diretórios escolhidos pelo usuário;
4. consultar e analisar o acervo com filtros, agregações, exportações e painéis analíticos.

## Documentos

- `VISION.md` — visão de produto e princípios;
- `ARCHITECTURE.md` — arquitetura alvo e responsabilidades;
- `DATA_MODEL.md` — evolução do SQLite operacional e analítico;
- `IMPLEMENTATION_PLAN.md` — plano incremental de entrega e homologação;
- `ROADMAP.md` — marcos funcionais da próxima fase;
- `ANALYTICS_PLAN.md` — consultas, indicadores e camada de data analytics/data science;
- `RELEASE_STRATEGY.md` — estratégia de branches, versões e releases;
- `CONTRIBUTING.md` — convenções para evolução segura;
- `CURSOR_CONTEXT.md` — contexto curto para agentes de código.

## Princípios

- processamento local por padrão;
- nenhuma ação administrativa destrutiva no EGBANET;
- downloads apenas a partir de links já validados e persistidos;
- operações longas com progresso, cancelamento, retomada e histórico;
- banco SQLite como fonte de verdade local;
- migrações idempotentes e retrocompatíveis;
- interface simples para operação e poderosa para consulta;
- toda nova funcionalidade deve ser homologável isoladamente.
