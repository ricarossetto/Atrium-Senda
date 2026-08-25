# ATRIUM — REGRAS FUNDAMENTAIS PARA AGENTES DE IA

Qualquer agente que opere neste repositório DEVE obedecer rigorosamente às seguintes diretrizes:

1. **Nunca trabalhar diretamente na branch `main`**:
   - Todo o desenvolvimento deve ocorrer na branch ativa de evolução (`beta-hardening`).
   - Nunca realizar merge automático para `main`.

2. **Nunca perder dados**:
   - Operações que alterem formato de armazenamento exigem backup prévio automático e testes de restauração.
   - Nenhuma migration pode ser destrutiva sem mecanismo de verificação.

3. **Não enfraquecer segurança ou privacidade**:
   - Manter autenticação multifator (TOTP RFC 6238), criptografia AES-256-GCM em repouso e sessões seguras HttpOnly.
   - Proibir commit ou log de chaves privadas, senhas, certificados ou dados pessoais (PII).

4. **Não criar arquitetura desnecessária (Anti-Overengineering)**:
   - Evitar adicionar frameworks, microserviços, filas ou bancos externos pesados sem necessidade justificada.
   - O usuário final é um advogado não técnico; o sistema deve funcionar de forma simples e rápida (instalação em até 10 minutos).

5. **Executar testes e manter suíte 100% verde**:
   - Executar `pnpm test` (ou `npm test`) antes e após alterações.
   - Nunca commitar com testes quebrados ou ignorados.

6. **Preservar compatibilidade e trabalhar incrementalmente**:
   - Realizar ciclos finitos focados em um objetivo claro por vez.
   - Manter a aplicação executável entre cada ciclo.

7. **Consultar o Plano Mestre e Documentação**:
   - Consultar sempre `DEVELOPMENT_MASTER_PLAN.md`, `docs/development/ROADMAP.md`, `docs/development/DECISIONS.md` e `docs/development/BETA_READINESS.md`.
