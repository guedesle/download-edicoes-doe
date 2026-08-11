# Modelo de dados

## Estado atual

A tabela `edicoes` é a fonte de verdade do inventário local e contém, entre outros campos:

- `egbanet_id` — chave técnica;
- dados editoriais (`tipo_edicao`, `data_edicao`, `numero_edicao`, suplemento, páginas);
- `edit_url` e `view_url`;
- `download_assinado_url` e `download_assinado_bytes`;
- `download_diario_url` e `download_diario_bytes`;
- `download_links_capturados_em`;
- metadados de coleta.

A tabela `sincronizacoes` registra execuções do inventário.

## Evolução proposta

### `download_lotes`

```sql
CREATE TABLE download_lotes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  criado_em TEXT NOT NULL,
  iniciado_em TEXT,
  concluido_em TEXT,
  nome TEXT,
  criterio_tipo TEXT NOT NULL,
  data_inicio TEXT,
  data_fim TEXT,
  tipos_arquivo TEXT NOT NULL,
  destino_descritivo TEXT,
  total_itens INTEGER NOT NULL DEFAULT 0,
  itens_concluidos INTEGER NOT NULL DEFAULT 0,
  itens_falhos INTEGER NOT NULL DEFAULT 0,
  bytes_previstos INTEGER,
  bytes_concluidos INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  erro TEXT
);
```

### `download_itens`

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
  FOREIGN KEY (lote_id) REFERENCES download_lotes(id),
  FOREIGN KEY (egbanet_id) REFERENCES edicoes(egbanet_id),
  UNIQUE(lote_id, egbanet_id, tipo_arquivo)
);
```

## Views analíticas propostas

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

Indicadores de operação dos lotes:
- duração;
- taxa de sucesso;
- volume concluído;
- falhas por tipo;
- tentativas médias.

## Índices

Manter índices por `data_edicao`, `numero_edicao`, `tipo_edicao`, status de captura e criar índices em `download_itens(lote_id,status)` e `download_lotes(status,criado_em)`.

## Migrações

Cada mudança de schema deve:
1. rodar em transação;
2. ser idempotente por versão;
3. preservar dados existentes;
4. possuir teste de migração de pelo menos a versão imediatamente anterior;
5. atualizar `PRAGMA user_version` apenas após sucesso.
