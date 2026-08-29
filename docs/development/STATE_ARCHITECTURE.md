# ATRIUM — Arquitetura de Persistência e Ciclo de Vida do Estado

Este documento estabelece o mapa canônico de persistência, modelo de versionamento, estratégias de migração determinística, classificação de dados e protocolos de recuperação do ATRIUM.

---

## 1. Mapa Canônico de Fontes de Estado

O ATRIUM organiza o armazenamento de dados em camadas estritamente isoladas para impedir que a limpeza de caches temporários destrua dados duráveis ou comprometa segredos criptográficos.

### A. Dados Duráveis do Usuário (data/app-state.json)
- **Natureza:** DURABLE / CRITICAL | Schema v7
- **Criptografia:** AES-256-GCM em disco através do SecurityManager (AUTH_ENCRYPTION_KEY).
- **Conteúdo:**
  - processes: Processos monitorados, partes, varas, histórico de movimentações, honorários.
  - contacts: Clientes, partes contrárias, testemunhas, correspondentes, parceiros.
  - tasks: Tarefas operacionais, prazos fatais, pontuações de tarefas, vínculos processuais.
  - agenda: Compromissos, audiências, perícias e prazos integrados.
  - financial: Lançamentos, requisições de pagamento (RPV/Precatórios/Alvarás), retenções contratuais (30%).
  - terms: Termos monitorados e inscrições na OAB.
  - sources: Fontes de monitoramento ativas (djen-cnj, datajud-cnj, a1, external-calendar).
  - configuration: Catálogos do escritório (tipos de ação, fases, grupos de ação, tarefas padrão).
  - audit: Trilha de auditoria append-only imutável (limite de 1.000 registros).
  - settings: Identidade visual do escritório, dados do titular e preferências globais.
  - customPrompts & customLinks: Prompts jurídicos e atalhos customizados.
- **Diretriz:** PRESERVAR E MIGRAR. Nunca descartar ou sobrescrever em resets de cache.

---

### B. Runtime e Dados Derivados (data/runtime.json)
- **Natureza:** DERIVED / REBUILDABLE | Schema v2
- **Criptografia:** AES-256-GCM em disco.
- **Conteúdo:**
  - events: Eventos transitórios e logs operacionais de coletores.
  - intimations: Publicações capturadas ainda em triagem antes da consolidação em tarefas.
  - updatedAt: Carimbo de data/hora da última execução do coletor autônomo.
- **Diretriz:** Pode ser reconstruído via POST /api/system/rebuild-runtime sem afetar o app-state.json.

---

### C. Segurança e Acesso (data/security.json)
- **Natureza:** SECURITY_CRITICAL / IMMUTABLE | Schema v2
- **Criptografia:** AES-256-GCM em disco.
- **Conteúdo:**
  - users: Usuários cadastrados, papéis (master_admin, admin, lawyer, assistant), status de aprovação.
  - passwordHash: Hashes scrypt (16384/8/1) com salt criptográfico único por usuário.
  - encryptedTotp: Segredos TOTP RFC 6238 cifrados por usuário.
  - recoveryHashes: Hashes SHA-256 de códigos de recuperação isolados por usuário.
  - trustedDevices: Dispositivos confiáveis de 30 dias com hash HMAC-SHA256 de tokens.
  - activeSessions: Sessões ativas autenticadas em memória/disco.
- **Diretriz:** NUNCA APAGAR EM OPERAÇÕES DE CACHE. Protegido contra deleções acidentais.

---

### D. Credenciais e Integrações Judiciais (data/judicial-integrations.json)
- **Natureza:** SECURITY_CRITICAL
- **Criptografia:** AES-256-GCM em disco.
- **Conteúdo:**
  - certificate: Caminho local do PFX A1 e senha mestre cifrada.
  - totpSecrets: Segredos TOTP (eproc, PJe, etc.) cifrados em repouso.
  - portalCredentials: Usuário/senha por tribunal com criptografia autenticada.
- **Diretriz:** NUNCA INCLUIR EM LIMPEZAS GENÉRICAS. Permanece intacto durante manutenções normais.

---

### E. Sessões Judiciais e Perfis do Navegador (data/judicial-sessions.json & data/browser-profiles/)
- **Natureza:** EXTERNAL_SESSION / VOLATILE
- **Conteúdo:**
  - data/judicial-sessions.json: Metadados de sessões ativas com tribunais e status de conexão.
  - data/browser-profiles/<user>/<portal>: Perfis locais de navegador com cookies de autenticação do tribunal.
- **Diretriz:** Descartável SOMENTE mediante comando explícito do usuário para um tribunal específico (Limpar sessão local deste portal). Nunca apagar A1 ou TOTP durante essa limpeza.

---

### F. Segredos de Inteligência Artificial (data/ai-secrets.json)
- **Natureza:** SECRETS_CRITICAL
- **Criptografia:** AES-256-GCM em disco.
- **Conteúdo:**
  - geminiApiKey: Chave de API Google Gemini cifrada em repouso.
- **Diretriz:** NUNCA APAGAR EM OPERAÇÕES DE CACHE.

---

### G. Armazenamento Local do Navegador (LocalStorage)

| Chave | Classificação | Descrição | Ciclo de Vida |
| :--- | :--- | :--- | :--- |
| atrium:ui:theme | UI_PREFERENCE | Preferência de tema (dark / light). | Persistente; resetável via Higiene de UI. |
| atrium:ui:sidebar_collapsed | UI_PREFERENCE | Estado recolhido da barra lateral desktop. | Persistente; resetável via Higiene de UI. |
| atrium:ui:schema_version | UI_PREFERENCE | Versão do esquema de preferências visuais. | Atualizado em migrações de UI. |
| atrium:tour:dismissed | UI_PREFERENCE | Flag indicando se o tour inicial foi concluído. | Resetável para rever o tour. |
| jurisflow_storage_v1 | LEGACY / DEPRECATED | Cache JSON legado de versões antigas. | Migrado uma única vez (one-shot) e destruído. Proibida a ressurreição. |
| jurisflow_theme | LEGACY / DEPRECATED | Chave de tema antiga. | Migrada para atrium:ui:theme e removida. |

---

## 2. Versionamento: App Version vs. Schema Version

O ATRIUM desacopla formalmente a versão da aplicação (appVersion) da versão estrutural do banco de dados (schemaVersion):
1. **appVersion (Semântica de Produto, ex.: 2.0.0-beta.11)**: Atualizada a cada patch, release ou melhoria visual, sem disparar migrações se o schema permanecer inalterado.
2. **schemaVersion (Versão Estrutural, CURRENT_SCHEMA_VERSION = 7)**: Incrementada apenas quando a persistência muda, disparando o motor de migrações determinísticas.

---

## 3. Registro e Migrações Determinísticas (v1 -> v7)

- **migrate1To2**: Normaliza termos monitorados, garantindo extração correta de número OAB e estado UF.
- **migrate2To3**: Migra identificadores de fontes de publicações (djen -> djen-cnj, datajud -> datajud-cnj), garantindo ausência de duplicatas.
- **migrate3To4**: Migra modelo financeiro de RPVs/alvarás (rpvAmount -> requisitionAmount), mantendo retrocompatibilidade e mapeando status de quitação para repassado.
- **migrate4To5**: Padroniza categorias de tarefas e prazos conforme o CPC/2015.
- **migrate5To6**: Remove chaves de IA legadas (settings.geminiApiKey) do estado geral, isolando-as no cofre ai-secrets.json.
- **migrate6To7**: Normaliza os catálogos de configuração do escritório e inicializa a estrutura de metadados migrationHistory.

---

## 4. Diretrizes de Segurança Absoluta

1. **Nunca Apagar Arquivo .env**: Segredos como AUTH_ENCRYPTION_KEY e AUTH_SESSION_SECRET são permanentes.
2. **Nunca Sobrescrever Corrupção com Sample Data**: Arquivo corrompido é quarentenado e o sistema entra em modo de recuperação sem sobrescrever dados.
3. **Escritas Atômicas**: Toda gravação de estado ocorre em arquivo temporário (app-state.json.tmp) com posterior substituição atômica (fs.rename).
4. **Isolamento de Chaves e Dispositivos**: Reset de cache de interface nunca remove usuários, fatores de autenticação (MFA), chaves A1 ou credenciais salvas.
