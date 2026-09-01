# INTEGRAÇÃO EPROC (TRF4, TJRS, TJSC, TJTO, TJRJ)
## Estratégia de Autenticação, Sessões Persistentes e Coleta de Acervo

O eproc é um dos sistemas de processo eletrônico mais eficientes do judiciário brasileiro, adotado pela Justiça Federal da 4ª Região e diversos Tribunais de Justiça estaduais.

---

## 🏛️ Estratégia de Conexão no ATRIUM

1. **Acesso com Certificado Digital A1**:
   - O Atrium utiliza o `ClientCertMtlsAuthAdapter` com o certificado ICP-Brasil modernizado via sandbox local.
2. **Acesso com Credenciais + TOTP (Segundo Fator)**:
   - Para tribunais que exigem login por usuário/senha e verificação em duas etapas, o Atrium provê o `CredentialsTotpAuthAdapter`.
3. **Persistência de Sessão**:
   - Utilização de perfis Chromium isolados em `data/browser-profiles/<user-id>/<portal-id>`.
   - Detecção de expiração com pausa e reconexão supervisionada; CAPTCHA ou intervenção exigida nunca é contornada.
4. **Relatórios em Lote**:
   - O eproc disponibiliza exportação nativa de relatórios de acervo em formato XLS/HTML. O importador do Atrium suporta a leitura direta desses relatórios com deduplicação instantânea.

Código de adapter não equivale a validação em todos os tribunais e graus. Cada portal deve permanecer `experimental` ou `not_verified` até existir evidência read-only específica, sem ato oficial.
