## Objetivo


## Mudanças principais

- 

## Regras de negócio afetadas


## SQLite / migração

- Schema alterado? Não / Sim
- `PRAGMA user_version`:
- Compatibilidade com banco existente:

## Riscos


## Homologação

1. `npm install`
2. `npm test`
3. `npm run build`
4. Recarregar `dist` em `chrome://extensions`
5. Executar os cenários descritos abaixo.

### Cenários

- [ ] fluxo principal
- [ ] cancelamento/erro
- [ ] persistência após fechar/reabrir popup
- [ ] regressão de Inventário
- [ ] regressão de Links de download

## Evidências

- [ ] testes passam
- [ ] build passa
- [ ] console sem erros inesperados
- [ ] documentação atualizada
