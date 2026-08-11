# Plano de Analytics e Ciência de Dados

## Objetivo

Criar uma camada de leitura que transforme o inventário do SQLite em indicadores operacionais e analíticos sem alterar os dados de origem.

## Indicadores fundamentais

### Produção editorial
- total de edições;
- edições por mês/ano;
- páginas totais;
- páginas médias/medianas por edição;
- maior e menor edição por páginas;
- distribuição por tipo de edição e suplemento.

### Repositório digital
- arquivos normais disponíveis;
- arquivos assinados disponíveis;
- bytes por tipo de arquivo;
- armazenamento total por mês/ano;
- tamanho médio/mediano por arquivo;
- bytes por página;
- projeção de crescimento de armazenamento.

### Qualidade dos dados
- edições sem `numero_paginas`;
- edições sem link normal;
- edições sem link assinado;
- links capturados sem tamanho;
- IDs com mesma identidade editorial;
- lacunas temporais aparentes;
- falhas de captura/download.

### Operação de downloads
- lotes criados/concluídos;
- taxa de sucesso;
- volume efetivamente baixado;
- tempo por GB e por arquivo;
- principais erros;
- quantidade de retries.

## Filtros globais

Todos os painéis devem aceitar, quando aplicável:
- data inicial/final;
- tipo de edição;
- suplemento;
- disponibilidade normal/assinada;
- faixa de páginas;
- faixa de tamanho.

## Visualizações recomendadas

- cards para KPIs;
- linha para séries temporais;
- barras para comparação mensal/anual e tipos;
- histogramas para distribuição de páginas/tamanho;
- tabela detalhada para outliers e qualidade.

Evitar gráficos decorativos sem pergunta analítica explícita.

## Data science

### Outliers
Começar com métodos robustos e explicáveis:
- IQR;
- mediana e MAD;
- z-score apenas quando a distribuição justificar.

### Tendência e sazonalidade
Usar agregações mensais. Separar tendência observada de inferência. Não extrapolar séries curtas sem aviso.

### Projeção de armazenamento
Priorizar modelos simples e auditáveis no início:
- média móvel;
- tendência linear/robusta;
- cenários baixo/base/alto.

Toda projeção deve mostrar:
- período usado no treinamento;
- hipótese;
- horizonte;
- erro histórico quando disponível;
- distinção visual entre observado e estimado.

## Reprodutibilidade

Cada KPI exibido deve ter uma consulta SQL documentada ou uma transformação determinística equivalente. Resultados analíticos não devem depender de estado oculto do popup.

## Privacidade

Dados operacionais e analíticos permanecem locais por padrão. Qualquer exportação deve ser explícita pelo usuário. Não publicar snapshots reais do banco em repositórios públicos sem avaliação de sensibilidade e autorização explícita.
