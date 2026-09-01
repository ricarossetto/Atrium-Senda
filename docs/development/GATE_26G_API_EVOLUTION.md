# Gate 26G — API Evolution Foundation

## Resultado

O ATRIUM continua com as rotas internas canônicas não versionadas. Foi adicionada uma pequena boundary de contrato para metadata autenticada, headers determinísticos e rejeição segura de prefixos de versão desconhecidos. Nenhuma rota existente foi copiada, renomeada ou tornada pública.

## Inventário auditado

O servidor possui rotas de bootstrap de autenticação, rotas internas consumidas pelo frontend, integrações privadas, ingestão por bearer e diagnósticos administrativos. A auditoria encontrou 58 combinações literais método/path, além de rotas dinâmicas de documentos, publicações e receivers. A contagem é evidência de auditoria, não um contrato público.

## Foundation executável

- `lib/api/api-contract.mjs` concentra versão, estabilidade, metadata e detecção de prefixo desconhecido;
- respostas JSON preservam payload e adicionam somente headers informativos;
- `/api/system/api-metadata` exige sessão e não enumera superfície sensível;
- `/api/v*` desconhecido não cai em static hosting nem alcança rota interna;
- clientes atuais continuam usando exatamente os paths existentes.

## Limite honesto

Não existe API pública, SDK, OAuth, escopos externos, `/v1`, `/v2`, deprecation live ou consumidor mobile/desktop certificado. Esses itens permanecem policy-only/futuros e exigem gate próprio quando houver consumidor real.
