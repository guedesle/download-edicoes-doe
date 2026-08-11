# Contexto para agentes de código

## Produto

Extensão Chrome MV3 para o EGBANET. A aplicação inventaria edições, captura links da `Versão Atual`, consulta tamanhos por `HEAD`, persiste tudo em SQLite WASM/OPFS e permite exportar o `.sqlite3`.

## Arquitetura atual

- Popup TypeScript/Vite;
- service worker para coordenação e `chrome.storage`/`chrome.downloads`;
- offscreen document para fetch autenticado e DOMParser;
- dedicated worker para SQLite WASM + OPFS.

## Regras já validadas

- `egbanet_id` é a chave técnica;
- identidade editorial não é única;
- `edit_url` segue `/admin/edicoes/edit/{id}`;
- downloads vêm somente da primeira linha de `#table_list` cuja coluna `Versão Número` contém `Versão Atual`;
- normal termina em `/0`, assinado em `/1`;
- tamanho só é salvo quando `HEAD` fornece `Content-Length` confiável;
- nenhuma ação de publicar, remover, gerar edição ou ordenar matérias.

## Próxima prioridade

Implementar `feat/download-engine` seguindo `docs/IMPLEMENTATION_PLAN.md` e `docs/DATA_MODEL.md`.

O motor deve:
1. criar lote a partir do SQLite;
2. aceitar edição individual, lista ou período;
3. aceitar normal, assinado ou ambos;
4. mostrar prévia de quantidade/páginas/volume;
5. executar fora do ciclo de vida do popup;
6. registrar lote e itens no SQLite;
7. suportar cancelamento e retry de falhas;
8. não baixar novamente item concluído ao retomar.

## Restrições

- preservar migrações existentes;
- não depender de `dist` versionado;
- não usar `fetch` de PDF para calcular tamanho;
- não fazer scraping extra quando o link já estiver no SQLite;
- não persistir caminhos locais sensíveis em logs desnecessários;
- manter build e testes existentes funcionando.

## Antes de alterar código

Leia:
- `README.md`;
- `docs/ARCHITECTURE.md`;
- `docs/DATA_MODEL.md`;
- `docs/IMPLEMENTATION_PLAN.md`;
- testes existentes.

Após alterar: `npm test` e `npm run build`.
