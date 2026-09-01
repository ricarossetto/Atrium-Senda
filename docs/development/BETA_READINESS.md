# ATRIUM — Checklist técnico do Beta e da migração UI V2

## Gate de integridade e segurança

- [x] App-state em JSON cifrado AES-256-GCM, revision-safe e com gravação atômica.
- [x] Backup cifrado com checksum SHA-256, validação integral e snapshot pré-restauração.
- [x] Runtime derivado distingue `EMPTY`, `READY` e `QUARANTINED`; corrupção é preservada em recovery e o rebuild é explícito.
- [x] Configurações deliberadamente vazias permanecem vazias após save/reload; chaves legadas ausentes recebem defaults.
- [x] Chave Gemini legada migra no startup para o secret store cifrado e nunca é retornada pelo endpoint de estado.
- [x] Feedback Beta é local, cifrado, atômico, limitado aos 100 registros mais recentes e não possui transporte externo.
- [x] Sessões HttpOnly/SameSite, CSRF, RBAC e TOTP opcional por usuário permanecem cobertos.
- [x] Segredos, TOTP, certificados, tokens e dados reais não aparecem em fixtures ou logs.

## Gate funcional e jurídico

- [x] Backend é a autoridade para identidade, permissões, revision e conteúdo de publicação usado em e-mail.
- [x] E-mail usa SMTP configurável, teste manual, envio individual manual e boletim em lote manual; não há auto-send.
- [x] Tarefa originada de publicação começa sem deadline; prazo fatal exige conferência e confirmação humana.
- [x] Discovery DJEN → CNJ → DataJud → processo/contatos é somente leitura e não produz ciência judicial.
- [x] Tratamento de publicação permanece separado de read/unread e de ciência oficial.
- [x] Frontend modular concluído; `js/portal.js` é composition shell sobre o Store e o backend existentes.
- [x] Migração UI V2 concluída sobre o mesmo App, Store, backend e regras de negócio da UI Clássica.
- [x] UI V2 é o modo padrão; a UI Clássica permanece fallback visual selecionável.
- [x] Neutralidade de marca protegida pela suíte dedicada.

## Gate de instalação e validação

- [x] Runtime canônico Node 24.x.
- [x] `pnpm@11.19.0` em package, CI e starter Windows.
- [x] Instalação canônica por `pnpm install --frozen-lockfile`.
- [x] Suíte canônica integral registrada, além de syntax check, E2E, job A1 Windows e Visual QA.
- [x] Paridade final, acessibilidade global, reflow e higiene de runtime da UI V2 cobertos pelo gate de conclusão.

## Status atual

- **Status técnico**: `UI V2 MIGRATION COMPLETE`, sujeito ao workflow integralmente verde do HEAD aprovado na branch `ui-v2`.
- **UI mode**: V2 por padrão, com preferência Classic respeitada como fallback de apresentação.
- **Autoridade funcional**: um único App, Store e backend para os dois modos.
- **Não significa**: release final, ambiente de produção certificado, auditoria jurídica ou disponibilidade contínua de serviços externos. A promoção para `main` depende de decisão posterior e explícita.

## Dívida externa conhecida

- Actions oficiais v4 ainda podem emitir aviso sobre o runtime Node interno mantido pelo GitHub. As versões não serão alteradas sem confirmação objetiva de release oficial compatível.
- SQLite é possibilidade futura e exige migração deliberada com backup/restore; o armazenamento Beta atual continua sendo JSON cifrado.
