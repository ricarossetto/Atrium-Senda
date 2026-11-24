# Readiness técnico — ATRIUM Senda

Status: **UI V2 MIGRATION COMPLETE**

A migração da interface foi concluída nas views oficiais. O produto opera com um único App, Store e backend. A interface V2 é a única interface oferecida ao usuário; o modo dual permanece apenas como registro histórico de engenharia.

## Arquitetura consolidada

- A arquitetura frontend foi modularizada por domínio, com features, componentes, apresentadores e um composition shell.
- O Store oficial continua sendo a fonte única de verdade do frontend.
- O backend é a autoridade de autenticação, autorização, concorrência e persistência.
- O estado oficial e os backups usam JSON cifrado com AES-256-GCM.
- A revisão e o conflito `409` continuam explícitos.
- Índices, caches e projeções são derivados e reconstruíveis.

O Frontend modular concluído não cria um segundo runtime, um segundo Store nem uma segunda regra de persistência.

## Limites de segurança

- Toda mutação autenticada exige CSRF.
- Segredos, certificados e chaves não ficam no Store do navegador.
- Integrações judiciais são somente leitura.
- Ciência, assinatura, petição e protocolo exigem ação humana fora do ATRIUM.
- Falhas de provedor não podem virar sucesso silencioso.
- Logs não devem conter senhas, tokens, cookies ou conteúdo judicial desnecessário.

## Gates de release

A promoção depende da validação local do escopo alterado e das suítes aplicáveis. O registro de cada execução deve informar comando, resultado e limitações.

1. `pnpm check`
2. `pnpm test:ui-v2`
3. `pnpm test:ui-v2-final`
4. `node tests/visual-qa.mjs`
5. contratos de instalação e distribuição
6. revisão do diff e da documentação da versão

Este documento registra o estado técnico e não atesta o ambiente de produção. A validação humana e a conferência dos instaladores publicados continuam necessárias.

## Persistência

A arquitetura atual usa o provider de estado cifrado do projeto. SQLite permanece uma possibilidade futura de backend dedicado, sujeita a decisão própria, migração, backup e testes de restauração. O SQLite não está implementado como o padrão atual do Store oficial.
