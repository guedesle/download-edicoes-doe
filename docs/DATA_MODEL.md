# Modelo de dados

## Schema operacional atual

O schema corrente é a **versão 6**.

### `edicoes`

Fonte de verdade do inventário local. Contém, entre outros campos:

- `egbanet_id` — chave técnica;
- dados editoriais (`tipo_edicao`, `data_edicao`, `numero_edicao`, suplemento, páginas);
- `edit_url` e `view_url`;
- `download_assinado_url` e `download_assinado_bytes`;
- `download_diario_url` e `download_diario_bytes`;
- `download_links_capturados_em`;
- metadados de coleta.

### `sincronizacoes`

Registra execuções do inventário.

### `download_lotes`

Uma linha por lote planejado/executado.

```sql
CREATE TABLE download_lotes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  criado_em TEXT NOT NULL,
  iniciado_em TEXT,
  concluido_em TEXT,
  nome TEXT,
  criterio_tipo TEXT NOT NULL,
  criterio_valor TEXT,
  data_inicio TEXT,
  data_fim TEXT,
  tipos_arquivo TEXT NOT NULL,
  destino_descritivo TEXT,
  total_itens INTEGER NOT NULL DEFAULT 0,
  itens_concluidos INTEGER NOT NULL DEFAULT 0,
  itens_falhos INTEGER NOT NULL DEFAULT 0,
  bytes_previstos INTEGER,
  bytes_conhecidos INTEGER NOT NULL DEFAULT 0,
  bytes_concluidos INTEGER NOT NULL DEFAULT 0,
  links_ausentes INTEGER NOT NULL DEFAULT 0,
  tamanhos_desconhecidos INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  erro TEXT
);
```

Semântica atual:

- `criterio_tipo`: `period` ou `egbanet_ids`;
- `criterio_valor`: JSON com os IDs quando o critério é manual;
- `tipos_arquivo`: `normal`, `signed` ou `both`;
- `bytes_conhecidos`: soma dos tamanhos disponíveis no momento da criação;
- `bytes_previstos`: recebe o total apenas quando todos os itens possuem tamanho conhecido; caso contrário fica `NULL`;
- `links_ausentes`: quantidade de arquivos solicitados sem URL capturada;
- `tamanhos_desconhecidos`: quantidade de itens disponíveis sem tamanho conhecido;
- lotes recém-criados usam status `queued`.

### `download_itens`

Uma linha por arquivo concreto incluído no lote.

```sql
CREATE TABLE download_itens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lote_id INTEGER NOT NULL,
  egbanet_id INTEGER NOT NULL,
  tipo_arquivo TEXT NOT NULL,
  url TEXT NOT NULL,
  bytes_esperados INTEGER,
  nome_arquivo TEXT NOT NULL,
  caminho_relativo TEXT,
  chrome_download_id INTEGER,
  tentativas INTEGER NOT NULL DEFAULT 0,
  iniciado_em TEXT,
  concluido_em TEXT,
  status TEXT NOT NULL,
  erro TEXT,
  FOREIGN KEY (lote_id) REFERENCES download_lotes(id) ON DELETE CASCADE,
  FOREIGN KEY (egbanet_id) REFERENCES edicoes(egbanet_id),
  UNIQUE(lote_id, egbanet_id, tipo_arquivo)
);
```

Somente itens com URL capturada são inseridos. O caminho relativo é determinístico e segue `AAAA/MM/nome.pdf`.

## Índices operacionais

Além dos índices do inventário, o schema v6 cria:

```sql
CREATE INDEX idx_download_lotes_status_criado
  ON download_lotes(status, criado_em DESC);

CREATE INDEX idx_download_itens_lote_status
  ON download_itens(lote_id, status);

CREATE INDEX idx_download_itens_edicao
  ON download_itens(egbanet_id);
```

## Migração v5 → v6

A migração:

1. executa em `BEGIN IMMEDIATE`;
2. cria as tabelas e índices de lotes;
3. não altera as linhas existentes de `edicoes` ou `sincronizacoes`;
4. atualiza `PRAGMA user_version` para 6 somente após sucesso;
5. executa `ROLLBACK` em caso de falha.

Bancos anteriores continuam passando pelas migrações legadas até v5 e, em seguida, pela migração v5→v6.

## Views analíticas planejadas

### `vw_edicoes_analytics`

Uma linha por edição com medidas derivadas:

- ano e mês;
- presença de arquivo normal/assinado;
- bytes normal/assinado/total;
- páginas;
- razão bytes por página;
- indicadores de lacuna de metadados.

### `vw_resumo_mensal`

Agregação mensal com:

- quantidade de edições;
- quantidade de arquivos normais e assinados;
- páginas totais;
- bytes totais por tipo;
- médias e máximos por edição.

### `vw_download_lotes_resumo`

Indicadores operacionais dos lotes:

- duração;
- taxa de sucesso;
- volume concluído;
- falhas por tipo;
- tentativas médias.

## Regra para próximas migrações

Cada mudança de schema deve:

1. rodar em transação;
2. ser condicionada pela versão atual;
3. preservar dados existentes;
4. possuir teste de migração quando tecnicamente viável;
5. atualizar `PRAGMA user_version` apenas após sucesso.
