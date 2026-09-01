# INTEGRAÇÃO PJE & PDPJ (TRT4, TJDFT, TRF1, TRF3, TRF5, TRF6)
## Arquitetura de Conexão, PJeOffice Pro e Proteção Estrita Read-Only

O Processo Judicial Eletrônico (PJe) e a Plataforma Digital do Poder Judiciário (PDPJ) possuem fluxos específicos de autenticação e requisitos de segurança operacional.

---

## 🏛️ Estratégias de Autenticação PJe no ATRIUM

1. **PJeOffice Pro Local (`PjeOfficeAuthAdapter`)**:
   - Comunicação através de socket de loopback seguro em `http://127.0.0.1:8800/pjeOffice/`.
   - O Atrium executa health check prévio para atestar a disponibilidade do aplicativo oficial antes de iniciar a sessão.
2. **PDPJ / SSO Unificado (`CredentialsTotpAuthAdapter` & `ClientCertMtlsAuthAdapter`)**:
   - Suporte ao login unificado da Justiça com 2FA ou certificado digital A1.
3. **Primeiro Acesso Manual Assistido (`ManualPersistentSessionAdapter`)**:
   - Criação assistida do primeiro login para guardar cookies e sessão de forma persistente.

Essas estratégias representam capacidades técnicas separadas, não certificação universal dos portais PJe. PFX cifrado, PJeOffice em execução e sessão autenticada são estados independentes. Sem evidência live específica, o portal permanece `experimental` ou `not_verified`.

---

## 🛡️ Trava de Segurança Read-Only Absoluta

O coletor do Atrium possui proteção em código para **NUNCA** executar atos processuais que gerem efeitos jurídicos tácitos ou preclusivos:
- **Proibido clicar em**: "Tomar Ciência", "Dar Ciência", "Confirmar Intimação", "Peticionar", "Assinar", "Enviar".
- Apenas a leitura de metadados, publicações disponibilizadas e consulta de acervo são executadas.
