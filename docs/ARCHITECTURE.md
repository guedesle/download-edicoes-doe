# Arquitetura alvo

## Visão geral

```text
Popup / UI
  ├── Inventário
  ├── Links de download
  ├── Downloads em lote
  ├── Consulta
  └── Analytics
          │
Service Worker MV3
  ├── coordenação de operações
  ├── chrome.downloads
  ├── persistência de status
  └── roteamento de mensagens
          │
Offscreen Document
  ├── fetch autenticado EGBANET
  ├── parsing DOM
  ├── metadados HTTP
  └── cliente do worker SQLite
          │
Dedicated Worker
  └── SQLite WASM + OPFS
```

## Fronteiras de responsabilidade

### UI
Não acessa SQLite diretamente. Solicita operações ao service worker e apresenta status persistido. Operações longas devem sobreviver ao fechamento do popup.

### Service worker
Coordena exclusão mútua, downloads e comunicação. O motor de lotes deve continuar executando mesmo com o popup fechado.

### Offscreen
Fica responsável por DOMParser e requisições autenticadas ao EGBANET quando necessárias. Não deve persistir estado por `chrome.storage` diretamente.

### SQLite worker
É a fonte de verdade para inventário, links, lotes, itens de lote e consultas analíticas. Todas as mudanças de schema devem ser transacionais e versionadas por `PRAGMA user_version`.

## Motor de downloads

O download em lote deve ser modelado como uma máquina de estados, não como um loop preso ao popup.

Estados de lote: `draft`, `queued`, `running`, `paused`, `completed`, `completed_with_errors`, `cancelled`, `error`.

Estados de item: `pending`, `downloading`, `completed`, `failed`, `skipped`, `cancelled`.

Requisitos:
- selecionar edição individual, intervalo ou lista;
- tipos `normal`, `assinado` ou `ambos`;
- calcular quantidade e volume previsto antes da execução quando tamanhos estiverem disponíveis;
- escolher diretório de destino por lote;
- evitar redownload acidental quando o arquivo já existe, com política explícita;
- retry apenas dos itens com falha;
- registrar download ID do Chrome, bytes esperados e resultado final;
- permitir cancelamento seguro.

## Diretório de destino

A extensão deve usar APIs suportadas pelo Chrome e não presumir acesso arbitrário ao sistema de arquivos. A experiência deve permitir ao usuário definir o destino no início da execução, respeitando as limitações de segurança do navegador e políticas da estação corporativa.

## Analytics

A camada analítica é somente leitura sobre o SQLite operacional, preferencialmente por views SQL e consultas agregadas. Não duplicar dados brutos sem necessidade.

## Concorrência

Sincronização, captura de links, exportação SQLite e mudanças estruturais do banco permanecem mutuamente exclusivas. Downloads podem ter sua própria política de concorrência controlada, inicialmente conservadora (1–2 arquivos simultâneos) e configurável após homologação.
