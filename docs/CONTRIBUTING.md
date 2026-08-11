# Contribuindo

## Fluxo recomendado

1. Atualize a branch base.
2. Crie uma branch curta e específica.
3. Implemente a menor unidade homologável.
4. Execute `npm test` e `npm run build`.
5. Teste a extensão carregando `dist` no Chrome.
6. Abra PR draft com passos de homologação.
7. Só marque como pronto após testar com banco existente.

## Convenções

### Código
- TypeScript estrito;
- evitar `any` em novas interfaces quando o contrato puder ser tipado;
- mensagens entre popup/service worker/offscreen/worker devem ter `type` explícito;
- parsing de HTML deve preferir cabeçalhos/atributos sem depender de posição fixa;
- URLs externas devem ser validadas antes de uso;
- operações SQLite compostas devem usar transação.

### Estado
Não usar o popup como fonte de verdade de operações longas. Persistir estado operacional no SQLite ou em `chrome.storage`, conforme responsabilidade.

### Banco
- nunca alterar uma coluna existente sem considerar migração;
- não avançar `user_version` antes do commit da migração;
- não apagar dados coletados para simplificar mudança de schema;
- preservar compatibilidade com exportação SQLite.

### UX
- estados `running`, `completed`, `cancelled` e `error` devem ser visíveis;
- operações demoradas precisam de cancelamento quando tecnicamente possível;
- não exibir porcentagem quando o denominador é desconhecido;
- ações destrutivas devem exigir confirmação;
- evitar ocultar falhas individuais dentro de um lote.

## Definition of Done

Uma alteração funcional está pronta quando:
- possui critérios de aceite verificáveis;
- testes relevantes foram adicionados/atualizados;
- `npm test` passa;
- `npm run build` passa;
- não introduz erro no console durante o fluxo homologado;
- documentação de operação foi atualizada;
- migrações foram verificadas sobre banco anterior, quando houver.
