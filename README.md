# Download de Edições DOE

Extensão Chrome para inventariar localmente as edições disponíveis no EGBANET e preparar o download de edições completas do Diário Oficial.

## Fluxos atuais

A interface possui duas abas independentes:

1. **Inventário** — percorre a listagem paginada de edições, mantém o SQLite local atualizado e permite exportar uma cópia do banco.
2. **Links de download** — visita as URLs `edit_url` já inventariadas e captura os links da versão atual de cada edição.

### Inventário

A extensão percorre a listagem autenticada do EGBANET:

- página 1: `https://egbanet.egba.ba.gov.br/admin/edicoes`
- página 2 em diante: `https://egbanet.egba.ba.gov.br/admin/edicoes/index/page:N`

A navegação segue o link `li.next` apresentado pelo próprio EGBANET. Cada URL de próxima página é validada contra o padrão conhecido antes da requisição.

Da coluna **Ações**, são persistidos:

- `edit_url`: `/admin/edicoes/edit/{egbanet_id}`;
- `view_url`: `/admin/edicoes/view/{egbanet_id}`.

A chave técnica é `egbanet_id`. A combinação `tipo_edicao + data_edicao + numero_edicao` é mantida como índice de consulta, não como restrição de unicidade, porque o EGBANET pode apresentar IDs técnicos distintos para a mesma combinação editorial.

#### Exportar SQLite

O botão **Exportar SQLite**, na aba Inventário, serializa o banco aberto usando a API oficial `sqlite3_js_db_export()` e abre o diálogo **Salvar como** do Chrome com o nome sugerido:

`download-edicoes-doe.sqlite3`

A exportação cria uma cópia do banco e **não remove, move ou altera** o arquivo persistido no OPFS. Sincronização, captura de links e exportação são mutuamente exclusivas para que o arquivo exportado represente um snapshot consistente.

### Captura dos links de download

Para cada edição inventariada, a extensão consulta:

`/admin/edicoes/edit/{egbanet_id}`

Na tabela `#table_list`, o parser percorre as linhas de cima para baixo e usa **somente a primeira linha cuja coluna “Versão Número” contém a expressão “Versão Atual”**. Versões históricas são ignoradas.

Dessa linha são persistidos:

- `download_assinado_url`: link da coluna **Download Assinado**, validado no padrão `/admin/edicoes/download_versao/{id}_{versao}/1`;
- `download_diario_url`: link da coluna **Normal**, validado no padrão `/admin/edicoes/download_versao/{id}_{versao}/0`.

O ID presente em cada URL precisa coincidir com o `egbanet_id` consultado. Links inesperados ou de outra edição não são gravados.

A aba permite:

- **Capturar pendentes**: processa somente edições ainda não capturadas;
- **Recapturar todos**: atualiza novamente links e tamanhos de todo o inventário;
- cancelar a operação preservando tudo que já foi persistido.

### Tamanho dos arquivos sem download

Depois de identificar cada link, a extensão faz uma requisição HTTP `HEAD` autenticada. Não é feito `GET` do PDF para descobrir tamanho.

Quando a resposta fornece um `Content-Length` confiável, o valor exato é armazenado em bytes:

- `download_assinado_bytes`;
- `download_diario_bytes`.

A conversão para MB deve ser feita na apresentação (`bytes / 1024 / 1024`), preservando a precisão no banco. Se `HEAD` não for suportado, `Content-Length` não estiver disponível ou a resposta usar uma codificação que impeça inferir o tamanho original com segurança, o campo fica `NULL` e o link continua válido.

## Arquitetura

```text
Popup MV3
   │
Service Worker
   ├── chrome.downloads (exportação SQLite)
   │
Offscreen Document
   ├── GET autenticado da listagem e das páginas edit
   ├── HEAD autenticado dos downloads
   ├── DOMParser
   └── Dedicated Worker
          └── SQLite WASM + OPFS
```

O inventário, a captura e a exportação são mutuamente exclusivos para evitar concorrência desnecessária no banco e no EGBANET.

A extensão não aciona publicar, remover, gerar edição, ordenar matérias nem qualquer outra ação administrativa.

## Banco local

Principais tabelas:

- `edicoes`: inventário consolidado e metadados de download;
- `sincronizacoes`: histórico das sincronizações do inventário.

Campos de download adicionados à tabela `edicoes`:

```text
download_assinado_url
download_assinado_bytes
download_diario_url
download_diario_bytes
download_links_capturados_em
```

O schema atual é a **versão 5**. Bancos anteriores são migrados automaticamente em transação, preservando os registros já coletados.

## Desenvolvimento e homologação

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
3. Carregue ou recarregue a pasta `dist`.
4. Autentique-se no EGBANET.
5. Na aba **Inventário**, sincronize as edições.
6. Use **Exportar SQLite** quando precisar consultar o banco fora do navegador.
7. Na aba **Links de download**, execute **Capturar pendentes**.

## Qualidade

Os testes cobrem, entre outros pontos:

- parsing por cabeçalhos em vez de posições fixas;
- `edit_url` e `view_url`;
- validação da paginação;
- captura somente da primeira linha contendo **Versão Atual**;
- rejeição de links cujo ID não corresponde à edição consultada;
- falha explícita quando a linha **Versão Atual** não existe.

O CI executa testes e build TypeScript/Vite nos pushes das branches `feat/**` e nos pull requests para `main`.
