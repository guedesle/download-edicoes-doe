# Download de Edições DOE

Extensão Chrome para inventariar localmente as edições disponíveis no EGBANET, capturar os links da versão atual, planejar lotes de download e preparar a preservação e análise do acervo.

## Fluxos atuais

A interface possui três abas operacionais:

1. **Inventário** — percorre a listagem paginada de edições, mantém o SQLite local atualizado e permite exportar uma cópia do banco.
2. **Links** — visita as URLs `edit_url` inventariadas e captura os links e tamanhos da versão atual de cada edição.
3. **Baixar** — cria uma prévia e persiste lotes de arquivos normais, assinados ou ambos. Nesta etapa o lote é planejado, mas nenhum PDF é iniciado automaticamente.

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

O botão **Exportar SQLite**, na aba Inventário, serializa o banco aberto usando `sqlite3_js_db_export()` e abre o diálogo **Salvar como** do Chrome com o nome sugerido:

`download-edicoes-doe.sqlite3`

A exportação cria uma cópia do banco e **não remove, move ou altera** o arquivo persistido no OPFS.

### Captura dos links de download

Para cada edição inventariada, a extensão consulta:

`/admin/edicoes/edit/{egbanet_id}`

Na tabela `#table_list`, o parser percorre as linhas de cima para baixo e usa **somente a primeira linha cuja coluna “Versão Número” contém a expressão “Versão Atual”**. Versões históricas são ignoradas.

Dessa linha são persistidos:

- `download_assinado_url`: coluna **Download Assinado**, padrão `/admin/edicoes/download_versao/{id}_{versao}/1`;
- `download_diario_url`: coluna **Normal**, padrão `/admin/edicoes/download_versao/{id}_{versao}/0`.

O ID presente em cada URL precisa coincidir com o `egbanet_id` consultado.

Depois de identificar cada link, a extensão faz `HEAD` autenticado. Quando `Content-Length` é confiável, persiste o tamanho exato em bytes em `download_assinado_bytes` e `download_diario_bytes`. Não é feito `GET` do PDF apenas para descobrir tamanho.

### Planejamento de lotes

A aba **Baixar** permite montar um lote por:

- intervalo de `data_edicao`; ou
- lista manual de até 500 IDs técnicos EGBANET.

O usuário escolhe **Normal**, **Assinado** ou **Normal + assinado** e pode informar um nome para o lote.

Antes de criar o lote, a extensão calcula uma prévia com:

- edições encontradas;
- arquivos disponíveis;
- páginas conhecidas;
- volume conhecido;
- links ausentes;
- tamanhos desconhecidos;
- IDs que não existem no inventário local.

Ao confirmar **Criar lote**, são inseridos registros em `download_lotes` e `download_itens` com status `queued`. Apenas arquivos com URL capturada entram em `download_itens`. **Nenhum PDF é baixado neste incremento.**

Os nomes planejados são determinísticos e os caminhos relativos seguem `AAAA/MM/`, por exemplo:

`2022/07/2022-07-31_edicao-12345_id-21535_normal.pdf`

A escolha do diretório de destino e o motor de execução pertencem ao próximo incremento.

## Arquitetura

```text
Popup MV3
   │
Service Worker
   ├── roteamento de operações
   └── chrome.downloads (exportação SQLite)
   │
Offscreen Document
   ├── GET autenticado da listagem e páginas edit
   ├── HEAD autenticado dos arquivos
   ├── DOMParser
   └── Dedicated Worker
          └── SQLite WASM + OPFS
```

Operações de escrita/planejamento são serializadas para evitar concorrência desnecessária sobre o SQLite.

A extensão não aciona publicar, remover, gerar edição, ordenar matérias nem qualquer outra ação administrativa do EGBANET.

## Banco local

Principais tabelas:

- `edicoes`: inventário consolidado e metadados dos arquivos;
- `sincronizacoes`: histórico das sincronizações;
- `download_lotes`: cabeçalho e resumo dos lotes planejados/executados;
- `download_itens`: arquivos concretos pertencentes a cada lote.

O schema atual é a **versão 6**. A migração v5→v6 cria somente as tabelas e índices de lotes, preservando o inventário, links e tamanhos já coletados.

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
5. Na aba **Inventário**, sincronize as edições se necessário.
6. Na aba **Links**, capture os links necessários.
7. Na aba **Baixar**, configure um período ou IDs EGBANET, selecione o tipo de arquivo e clique em **Calcular prévia**.
8. Confira edições, arquivos, páginas, volume e lacunas.
9. Clique em **Criar lote** e confirme que a mensagem informa que nenhum download foi iniciado.

## Qualidade

Os testes cobrem, entre outros pontos:

- parsing por cabeçalhos;
- `edit_url` e `view_url`;
- validação da paginação;
- primeira ocorrência de **Versão Atual**;
- validação do ID dos links;
- listas de IDs EGBANET;
- validação de período;
- expansão normal/assinado/ambos;
- geração determinística de nomes e caminhos dos itens do lote.

O CI está configurado para executar testes e build nos pushes das branches `feat/**` e nos pull requests definidos pelo workflow do projeto.
