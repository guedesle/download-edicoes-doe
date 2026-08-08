# Download de Edições DOE

Extensão Chrome para inventariar localmente as edições disponíveis no EGBANET e, nas próximas etapas, automatizar o download de edições completas do Diário Oficial.

## Etapa atual — inventário SQLite

A extensão percorre a listagem autenticada do EGBANET:

- página 1: `https://egbanet.egba.ba.gov.br/admin/edicoes`
- página 2 em diante: `https://egbanet.egba.ba.gov.br/admin/edicoes/index/page:N`

A navegação segue o link `li.next` apresentado pelo próprio EGBANET. Cada URL de próxima página é validada contra o padrão conhecido antes da requisição.

Os registros encontrados são persistidos em SQLite, dentro do OPFS da extensão, usando o pacote oficial `@sqlite.org/sqlite-wasm`. O banco é local à estação e não envia o inventário para serviços externos.

### Identidade de uma edição

A chave técnica é `egbanet_id`. A identidade editorial também é protegida por restrição única composta por:

`tipo_edicao + data_edicao + numero_edicao`

As sincronizações são idempotentes: registros existentes são atualizados por UPSERT, preservando a primeira data de coleta e atualizando a última coleta.

## Arquitetura

```text
Popup MV3
   │
Service Worker
   │
Offscreen Document
   ├── fetch autenticado EGBANET
   ├── DOMParser / parser da tabela
   └── Dedicated Worker
          └── SQLite WASM + OPFS
```

O parser resolve as colunas pelos textos dos cabeçalhos da tabela, e não por posições fixas. Mudanças que removam a tabela esperada geram erro explícito em vez de produzir registros incorretos silenciosamente.

A extensão não executa ações administrativas do EGBANET como publicar, remover, gerar ou ordenar matérias.

## Desenvolvimento

Requisitos:

- Node.js 22+
- npm
- Chrome 116+

```bash
npm install
npm test
npm run build
```

Depois do build:

1. Abra `chrome://extensions`.
2. Ative **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação**.
4. Selecione a pasta `dist`.
5. Autentique-se normalmente no EGBANET.
6. Abra a extensão e clique em **Sincronizar edições**.

A interface mostra páginas processadas, edições encontradas, registros novos/atualizados e o estado final da sincronização. Como a paginação não informa o total global de páginas antecipadamente, a UI não apresenta uma porcentagem artificial.

## Banco local

Principais tabelas:

- `edicoes`: inventário consolidado das edições;
- `sincronizacoes`: histórico de execuções, contagens, estado e erro final quando houver.

Campos vazios do EGBANET são armazenados como `NULL`. Datas editoriais são normalizadas para ISO (`YYYY-MM-DD`) e data/hora de publicação para `YYYY-MM-DDTHH:mm:ss`, sem inferência de fuso horário.

## Qualidade

O CI executa testes do parser e build TypeScript/Vite em cada push da branch de feature e em pull requests para `main`.
