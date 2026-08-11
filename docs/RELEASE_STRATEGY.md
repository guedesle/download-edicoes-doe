# Estratégia de releases

## Objetivo

Manter a extensão sempre homologável e reduzir o risco de misturar mudanças estruturais com funcionalidades ainda não validadas.

## Branches

### `main`
Código homologado e pronto para uso operacional.

### `feat/*`
Uma capacidade funcional por branch. Exemplos:
- `feat/download-engine`;
- `feat/data-query`;
- `feat/analytics-dashboard`.

### `fix/*`
Correções pontuais e regressões.

### `docs/*`
Documentação e planejamento sem mudança de runtime.

Não criar uma branch `develop` permanente enquanto a equipe for pequena; usar PRs encadeados quando uma feature depender de outra ainda não mergeada.

## Pull requests

Todo PR deve informar:
- objetivo;
- regra de negócio;
- mudanças de schema;
- riscos;
- passos de homologação;
- evidência de `npm test` e `npm run build`;
- plano de rollback/migração quando aplicável.

PRs de funcionalidades grandes começam como draft.

## Versionamento

Usar SemVer quando a extensão entrar em ciclo regular de releases:
- PATCH: correção sem mudança de comportamento esperado;
- MINOR: nova funcionalidade retrocompatível;
- MAJOR: mudança incompatível de dados, operação ou requisitos.

Enquanto estiver em `0.x`, incrementar minor para marcos relevantes e patch para correções de homologação.

## Release operacional

Antes de promover para `main`:
1. testes automatizados verdes;
2. build local confirmado;
3. migração testada sobre banco existente;
4. homologação no Chrome da estação alvo;
5. regressão de inventário e captura;
6. documentação atualizada.

## Banco SQLite

O arquivo SQLite real de produção não deve ser versionado no Git por padrão. Para testes, preferir fixtures sintéticas ou snapshots anonimizados e mínimos.
