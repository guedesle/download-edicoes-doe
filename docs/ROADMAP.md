# Roadmap

## Fase 8 — Repositório digital e analytics

### 8.1 Downloads em lote
Objetivo: permitir que o usuário selecione uma edição, uma lista ou um período e baixe arquivos normais, assinados ou ambos para um destino escolhido no momento da execução.

Escopo:
- criação de lotes;
- prévia de quantidade e volume;
- execução persistente;
- progresso, cancelamento e retry;
- histórico no SQLite;
- organização de nomes/subpastas.

### 8.2 Consulta de dados
Objetivo: consultar o inventário sem precisar exportar o SQLite.

Escopo:
- filtros combináveis;
- tabela paginada;
- totais do filtro;
- abertura de links;
- exportação CSV/Excel.

### 8.3 Analytics
Objetivo: transformar o inventário em informação gerencial.

Escopo:
- edições por período;
- páginas por período;
- quantidade de arquivos;
- armazenamento por tipo;
- médias, máximos, mínimos e crescimento;
- comparação entre períodos;
- qualidade de dados.

### 8.4 Ciência de dados
Objetivo: explorar padrões e apoiar planejamento de capacidade.

Escopo:
- outliers;
- tendências;
- sazonalidade;
- projeções de armazenamento;
- análises reproduzíveis e claramente separadas de dados observados.

### 8.5 Performance e escala
Objetivo: manter a extensão responsiva com acervo crescente.

Escopo:
- profiling de consultas;
- índices específicos;
- paginação/virtualização;
- concorrência controlada de downloads;
- redução de mensagens grandes entre workers;
- testes com bases de maior volume.

## Ordem recomendada

`8.1 Downloads` → `8.2 Consulta` → `8.3 Analytics` → `8.4 Ciência de dados` → `8.5 otimizações orientadas por medição`.

Performance deve ser observada desde o início, mas otimizações estruturais só entram quando houver evidência de gargalo.
