# Visão do produto

## Missão

Disponibilizar uma plataforma local, auditável e de baixa fricção para coletar, preservar, baixar, consultar e analisar as edições do Diário Oficial disponíveis no EGBANET.

## Visão de longo prazo

A extensão deve deixar de ser apenas um coletor e tornar-se uma ferramenta interna de gestão do acervo digital: capaz de operar downloads em escala, registrar o histórico dessas operações e responder perguntas analíticas sobre produção editorial, volume de páginas, crescimento de armazenamento e disponibilidade de arquivos.

## Usuários e cenários

### Operação
- selecionar uma edição individual, lista ou período;
- escolher arquivo normal, assinado ou ambos;
- escolher o destino do lote no momento da execução;
- acompanhar progresso, falhas, volume e conclusão;
- retomar ou repetir somente itens com falha.

### Consulta
- filtrar por data, número, tipo, suplemento e disponibilidade;
- consultar links e tamanhos;
- exportar resultados;
- abrir o arquivo de origem quando necessário.

### Analytics
- acompanhar edições, páginas, arquivos e armazenamento por período;
- identificar lacunas e anomalias;
- comparar meses e anos;
- produzir bases para estudos estatísticos e projeções.

## Princípios de produto

1. **Segurança operacional** — nenhuma funcionalidade de publicação, remoção, geração ou alteração de edição.
2. **Local-first** — inventário, histórico e análises permanecem locais por padrão.
3. **Observabilidade** — operações demoradas informam progresso e registram resultado.
4. **Recuperabilidade** — falhas parciais não invalidam lotes concluídos.
5. **Dados antes de automação** — decisões são baseadas no SQLite inventariado, não em scraping repetitivo desnecessário.
6. **Evolução incremental** — cada fase deve ser testável e utilizável antes da próxima.
