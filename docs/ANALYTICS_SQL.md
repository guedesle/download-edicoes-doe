# SQL reproduzível do Analytics

A página `analytics.html` lê exclusivamente `/download-edicoes-doe.sqlite3` no OPFS da própria extensão. O worker abre `OpfsDb(..., 'r')`, não executa `fetch` e não depende de sessão autenticada no EGBANET.

## Filtros globais

A normalização reutiliza `buildEditionQueryWhere` da aba Consulta. Quando presentes, os filtros são aplicados por período, tipo de edição, suplemento e disponibilidade de arquivo. Para o acervo legado, `suplemento = 1 OR suplemento IS NULL` representa suplemento e `suplemento = 0` representa edição regular.

## KPIs

```sql
SELECT
  COUNT(*) AS edicoes,
  COALESCE(SUM(COALESCE(numero_paginas, 0)), 0) AS paginas,
  COALESCE(SUM(CASE WHEN download_diario_url IS NOT NULL THEN 1 ELSE 0 END), 0)
    + COALESCE(SUM(CASE WHEN download_assinado_url IS NOT NULL THEN 1 ELSE 0 END), 0) AS arquivos,
  COALESCE(SUM(COALESCE(download_diario_bytes, 0) + COALESCE(download_assinado_bytes, 0)), 0) AS bytes_conhecidos
FROM edicoes
/* WHERE global */;
```

## Série temporal

Mensal usa `substr(data_edicao, 1, 7)`; anual usa `substr(data_edicao, 1, 4)`.

```sql
SELECT
  substr(data_edicao, 1, 7) AS periodo,
  COUNT(*) AS edicoes,
  COALESCE(SUM(COALESCE(numero_paginas, 0)), 0) AS paginas,
  COALESCE(SUM(CASE WHEN download_diario_url IS NOT NULL THEN 1 ELSE 0 END), 0)
    + COALESCE(SUM(CASE WHEN download_assinado_url IS NOT NULL THEN 1 ELSE 0 END), 0) AS arquivos,
  COALESCE(SUM(COALESCE(download_diario_bytes, 0) + COALESCE(download_assinado_bytes, 0)), 0) AS bytes
FROM edicoes
/* WHERE global */
GROUP BY periodo
ORDER BY periodo ASC;
```

## Tipos de edição

```sql
SELECT
  COALESCE(NULLIF(TRIM(tipo_edicao), ''), '(sem tipo)') AS tipo,
  COUNT(*) AS edicoes,
  COALESCE(SUM(COALESCE(numero_paginas, 0)), 0) AS paginas
FROM edicoes
/* WHERE global */
GROUP BY tipo
ORDER BY edicoes DESC, tipo COLLATE NOCASE ASC;
```

A análise temporal por tipo acrescenta a chave `periodo` ao `SELECT`, `GROUP BY` e `ORDER BY`.

## Distribuições

Páginas válidas:

```sql
SELECT numero_paginas
FROM edicoes
/* WHERE global */ AND numero_paginas IS NOT NULL AND numero_paginas >= 0;
```

Tamanhos válidos são lidos separadamente de `download_diario_bytes` e `download_assinado_bytes`, sempre `> 0`, e concatenados deterministicamente no worker.

Faixas de páginas: `0–20`, `21–40`, `41–60`, `61–80`, `81–100`, `101–150`, `151–200`, `201+`.

Faixas de tamanho: `≤10 MB`, `10–25 MB`, `25–50 MB`, `50–100 MB`, `100–200 MB`, `>200 MB`, usando 1 MB = 1.048.576 bytes.

## Boxplot

Quartis usam interpolação linear na posição `(n - 1) × p`, para `p = 0,25`, `0,50` e `0,75`. O IQR é `Q3 - Q1`. Whiskers são os valores observados extremos ainda dentro de `Q1 - 1,5×IQR` e `Q3 + 1,5×IQR`; os demais são contados como outliers.

## Curva normal de referência

O histograma usa 12 classes de largura igual entre mínimo e máximo. A curva sobreposta usa média e desvio-padrão populacional do conjunto filtrado:

`f(x) = exp(-0,5 × ((x-μ)/σ)^2) / (σ × sqrt(2π))`.

A curva é apenas referência visual e não constitui teste de normalidade.

## Regressão linear temporal

A regressão usa `x = 0..n-1` para os períodos ordenados e `y = páginas do período`. Inclinação e intercepto são obtidos por mínimos quadrados; `R²` é o quadrado da correlação de Pearson. A interface apresenta a regressão como tendência descritiva e não extrapola valores futuros.

## Qualidade

```sql
SELECT
  SUM(CASE WHEN numero_paginas IS NULL THEN 1 ELSE 0 END) AS sem_paginas,
  SUM(CASE WHEN download_diario_url IS NULL THEN 1 ELSE 0 END) AS sem_normal,
  SUM(CASE WHEN download_assinado_url IS NULL THEN 1 ELSE 0 END) AS sem_assinado,
  SUM(CASE WHEN download_diario_url IS NOT NULL AND download_diario_bytes IS NULL THEN 1 ELSE 0 END)
    + SUM(CASE WHEN download_assinado_url IS NOT NULL AND download_assinado_bytes IS NULL THEN 1 ELSE 0 END) AS links_sem_tamanho
FROM edicoes
/* WHERE global */;
```
