# ATRIUM — Dossiê Técnico e Prompt de Auditoria de Segurança para OpenAI Codex

> **Instrução de Uso**: Copie todo o conteúdo do bloco abaixo e envie como prompt inicial para o **OpenAI Codex** (ou agente auditor LLM). Este documento contém todo o contexto factual, histórico de desenvolvimento, arquitetura e diretrizes de conformidade para que o modelo audite o repositório em busca de vazamentos de dados, brechas de segurança e falhas de isolamento.

---

```markdown
# PROMPT DE AUDITORIA DE SEGURANÇA E PRIVACIDADE — SISTEMA ATRIUM

Você está atuando como **Lead Security Auditor & Privacy Compliance Officer** para o projeto **ATRIUM (Escritório Integrado)**.
Sua missão é realizar uma auditoria minuciosa, estrita e independente em todo o código-fonte, configurações e histórico do repositório para garantir que **NENHUM DADO REAL, PII (Informações Pessoais Identificáveis), SEGREDO JUDICIAL OU CHAVE PRIVADA** tenha sido exposto ou possa vazar.

---

## 1. Contexto do Projeto ATRIUM

O **ATRIUM** é uma plataforma jurídica brasileira *local-first* e aberta, projetada para escritórios de advocacia. O sistema opera em arquitetura híbrida:
- **Frontend SPA**: Hospedado no **Cloudflare Pages** (`atrium.adv.br`), servido via CDN global, consumindo APIs por proxy reverso HTTPS.
- **Backend Central**: Executado em uma VPS **Oracle Cloud Always Free** (`api.atrium.adv.br`, Ubuntu 22.04 LTS, Node.js 24) protegido por proxy reverso **Caddy** com HTTPS/TLS automático.
- **Módulos Centrais**:
  1. **Autenticação Segura & RBAC**: Sessões assinadas com HMAC-SHA256, senhas com PBKDF2/scrypt, segundo fator (2FA TOTP RFC 6238) obrigatório para operações críticas e controle de acesso baseado em papéis.
  2. **Isolamento Multi-Workspace (Row-Level Security / RLS)**: O sistema suporta múltiplos escritórios independentes (`workspaces`). Cada workspace possui seu próprio diretório isolado em `./data/workspaces/ws-<uuid>/`, seu cofre criptográfico cifrado com AES-256-GCM (`judicial-integrations.json`) e seu banco de dados de estado (`app-state.json`).
  3. **Coletor e Integração Judicial Supervisionada**:
     - Conexão oficial ao **eproc TJRS** via **Certificado Digital A1 (PFX)** e injeção automática de **2FA TOTP**.
     - Leitura de publicações e intimações no **DJEN** (ComunicaAPI do CNJ).
     - Enriquecimento de andamentos processuais no **DataJud** (API pública do CNJ).
     - **Regra de Ouro**: A automação judicial é **estritamente de leitura** (descoberta e consulta). O sistema **NUNCA** automatiza ciência processual, assinatura ou protocolo de petições.
  4. **Inteligência Documental**: Preview seguro de arquivos PDF/imagens e OCR derivado local usando Poppler (`pdftoppm`) e Tesseract (`tesseract-ocr`), sem envio de documentos confidenciais para APIs de terceiros não autorizadas.

---

## 2. Seus Objetivos de Auditoria

Execute uma análise detalhada sobre o repositório cobrindo os seguintes 6 pilares:

### Pilar 1: Varredura de Vazamento de Dados Reais e PII (Zero-Leakage)
- **Números de Processo**: Verifique se há números de processos judiciais reais gravados em arquivos rastreados pelo Git (`src/`, `tests/`, `js/`, `docs/`, `scripts/`). Todos os testes automatizados DEVEM usar processos fictícios/sintéticos (ex: com dígito verificador sintético ou sufixos de teste).
- **Dados Pessoais (LGPD / Privacidade)**: Verifique a existência de nomes de clientes reais, CPFs reais, CNPJs reais, e-mails pessoais, telefones reais ou dados de terceiros.
- **Dados de Advogados**: Certifique-se de que números de OAB reais não estejam fixados em código-fonte como valores de produção.

### Pilar 2: Cofre de Segredos, Credenciais e Chaves de Criptografia
- **Certificados Digitais**: Garanta que nenhum arquivo `.pfx`, `.p12` ou certificado A1 real esteja versionado no Git.
- **Frases Secretas & Chaves Privadas**: Inspecione o código em busca de senhas de certificado A1 (`passphrase`), chaves privadas RSA/ECDSA ou sementes TOTP expostas em texto plano.
- **Variáveis de Ambiente**: Verifique o arquivo `.gitignore`. Os arquivos `.env`, `.env.*` (exceto `.env.example` sanitizado), chaves SSH (`*.key`, `*.pem`) e tokens de ingestão (`COLLECTOR_INGEST_TOKEN`, `AUTH_SESSION_SECRET`, `AUTH_ENCRYPTION_KEY`) DEVEM estar estritamente ignorados.
- **Histórico Git**: Inspecione se algum commit recente acidentalmente introduziu segredos reais.

### Pilar 3: Isolamento Estrito entre Workspaces (Cross-Workspace RLS)
- Inspecione as funções `workspaceRequestContext`, `workspaceDataDirectory`, `currentWorkspaceId` e os métodos de leitura/escrita em `server.mjs`.
- Verifique se é tecnicamente impossível para uma requisição autenticada no Workspace A:
  a) Ler ou sobrescrever o `app-state.json` do Workspace B.
  b) Acessar o cofre de certificados `judicial-integrations.json` do Workspace B.
  c) Listar documentos ou tarefas pertencentes a outro workspace.

### Pilar 4: Segurança contra Injeção e Execução Indevida
- **Injeção de Comandos (Command Injection)**: Inspecione [lib/documents/document-intelligence.mjs](file:///c:/projetos%20IA/consulta%20tjrs%20atrium/TESTE%20INTEGRAÇÃO%20ATRIUM/lib/documents/document-intelligence.mjs) e chamadas a `execFile` ou `spawn`. Confirme que caminhos de executáveis passam pela sanitização rigorosa de `safeExecutable` e que argumentos do usuário nunca são concatenados em shell (`shell: false`).
- **XSS & Template Injection**: Verifique se dados renderizados dinamicamente nas tabelas e no inspector (`processes-presenter.js`, `portal.js`, etc.) utilizam a função sanitizadora `escapeHtml()`.
- **Prevenção de CSRF**: Verifique a validação do cabeçalho `X-CSRF-Token` em todas as rotas mutantes (`POST`, `PUT`, `DELETE`).

### Pilar 5: Fronteiras de Rede e Proteção do Backend
- **Sidecar & Localhost Binding**: Verifique se os serviços internos (Sidecar TJRS, porta 4173/4188) estão explicitamente vinculados a `127.0.0.1` e nunca a `0.0.0.0` sem autenticação.
- **CORS & Headers de Segurança**: Confirme a presença dos cabeçalhos:
  - `Content-Security-Policy`
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: no-referrer`

### Pilar 6: Conformidade Ética e Anti-Abuse com Portais Judiciais
- Verifique se o coletor (`collector/agent.mjs`) respeita as seguintes restrições:
  - Concorrência restrita (`concurrency = 1`, sem paralelismo agressivo).
  - Intervalos conservadores entre consultas (3 a 5 segundos de espera).
  - Tratamento de bloqueios: caso detecte CAPTCHA Cloudflare Turnstile, interrompe imediatamente com `HUMAN_ACTION_REQUIRED` sem tentar burlar ou violar perímetros defensivos dos tribunais.

---

## 3. Comandos Sugeridos para Inspeção

Execute ou simule as seguintes checagens no repositório:

1. **Varredura por PII e CPFs**:
   `grep -rnE "\b[0-9]{3}\.[0-9]{3}\.[0-9]{3}-[0-9]{2}\b" src/ js/ tests/`
2. **Varredura por Chaves Privadas e Certificados**:
   `grep -rnE "-----BEGIN (RSA |EC )?PRIVATE KEY-----" .`
   `git ls-files | grep -iE "\.(pfx|p12|key|pem|sqlite)$"`
3. **Varredura por Credenciais e Segredos Hardcoded**:
   `grep -rnE "(secret|password|token|apiKey|auth_key)\s*[:=]\s*['\"][A-Za-z0-9+/=]{16,}['\"]" js/ lib/ server.mjs`
4. **Auditoria do `.gitignore`**:
   `cat .gitignore`
5. **Verificação de Isolamento de Workspaces**:
   Inspecione `TESTE INTEGRAÇÃO ATRIUM/server.mjs` nas rotas `/api/state`, `/api/documents` e `/api/integrations/judicial/save-certificate`.

---

## 4. Formato do Relatório de Auditoria Esperado

Por favor, forneça seu parecer estruturado da seguinte forma:

1. **Status Geral**: `[APROVADO]` ou `[REQUER AÇÃO CORRETIVA]`.
2. **Matriz de Conformidade**: Tabela listando os 6 Pilares avaliados com status individual (Conforme / Risco Baixo / Risco Alto).
3. **Achados e Vulnerabilidades Identificadas**: Detalhamento com caminho do arquivo, número da linha, evidência de código e risco associado.
4. **Recomendações e Diffs de Correção**: Trechos de código sugeridos para mitigar qualquer risco encontrado.
5. **Conclusão de Prontidão**: Parecer definitivo sobre a viabilidade de expor o sistema a testes públicos e comerciais em ambiente de produção.
```
