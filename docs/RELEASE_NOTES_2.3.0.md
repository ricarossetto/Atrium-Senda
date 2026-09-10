# Notas de Lançamento — ATRIUM v2.3.0 (Cloud & Desktop)

**Data de Lançamento:** 10 de Setembro de 2026  
**Ambiente Oficial de Produção:** [https://atrium.adv.br](https://atrium.adv.br)  
**API Central & Backend:** [https://api.atrium.adv.br](https://api.atrium.adv.br)  
**Licença:** MIT — Open Source & Local-First  

---

## Destaques da Versão 2.3.0

A versão **2.3.0** consolida o ATRIUM como a plataforma definitiva de gestão jurídica moderna, soberana e inteligente para escritórios de advocacia no Brasil. Esta versão traz uma experiência de integração de ponta a ponta, desde a arquitetura híbrida de produção em nuvem (Cloudflare Pages + Oracle Cloud Always Free) até o novo fluxo de Onboarding Show interativo e refinamentos visuais de alta precisão na interface.

---

### 1. Novo Onboarding Show & Personalização Guiada
- **Jornada em 6 Etapas Interativas**:
  1. **Apresentação & Propósito**: Visão geral da plataforma, proposta de valor da IA jurídica e segurança local-first.
  2. **Perfil do Advogado Titular**: Carregamento de foto de perfil em tempo real, geração de iniciais dinâmicas, inscrição OAB, UF e contatos profissionais.
  3. **Identidade do Escritório**: Upload de logomarca institucional, nome da banca, slogan e sede.
  4. **Atmosfera & Tema**: Seletor de visual entre *Modo Escuro Imersivo (Black & Gold)* e *Modo Claro Executivo (Pearl & Gold)* com troca dinâmica no mesmo instante.
  5. **Conexões & Monitoramento**: Painel de integrações oficiais com DJEN, DataJud e eproc TJRS.
  6. **Celebração & Crachá Executivo**: Geração dinâmica de um crachá virtual personalizado em 3D sutil com checklist de prontidão e botão de ativação.
- **Microinterações e Animações Suaves**: Transições fluidas com aceleração de hardware e respeito automático a `prefers-reduced-motion`.

---

### 2. Estabilização e Alta Definição do Favicon
- **Resolução Multi-Navegador**: Criação de binário nativo `favicon.ico` com matrizes 16x16, 32x32 e 48x48 para eliminar o expurgo de ícones em navegadores Chromium (Chrome, Brave, Edge).
- **Alto Contraste**: Restauração do contêiner escuro arredondado `#121517` com o monograma dourado no `favicon.svg`.
- **Fallbacks Rasterizados**: Suporte nativo a dispositivos Apple (`apple-touch-icon.png`), PWA (`favicon-192x192.png`) e PNGs de alta densidade.
- **Cache-Busting v2.3.0**: Todos os assets de ícone e CSS contam com controle de versão explícito e cabeçalhos dedicados no Cloudflare Edge.

---

### 3. Refinamentos da Carteira de Processos e Painel Lateral
- **Badge de Enriquecimento eproc Sutil**: Substituição de botões expansivos anteriores por badges delicados (`display: inline-flex`, tom âmbar suave `rgba(245, 158, 11, 0.08)`, borda de 1px e bullet circular discreto).
- **Grade Fixa 3x3 na Gaveta de Inspeção**: Todos os 9 botões de ação do processo permanecem permanentemente alinhados em 3 linhas por 3 colunas:
  - *Linha 1*: Criar tarefa | Baixar Autos com A1 | Atualizar TJRS
  - *Linha 2*: Editar processo | Ver documentos | Ver tarefas relacionadas
  - *Linha 3*: Usar no Assistente | Adicionar Chave | Excluir processo
  - Ações não aplicáveis a um determinado processo são desabilitadas com tooltips contextuais claros, eliminando saltos ou lacunas na grade.

---

### 4. Inteligência Documental & OCR Local Seguro
- Visualização instantânea de documentos PDF e imagens em ambiente inerte.
- OCR local supervisionado baseado em **Poppler** (`pdftoppm`) e **Tesseract** (`tesseract-ocr`), garantindo extração de texto sem tráfego de dados confidenciais por servidores externos.
- Hardening multiplataforma em `lib/documents/document-intelligence.mjs` com proteção contra caminhos cruzados entre Windows e Linux.

---

### 5. Coletor Judicial Supervisionado & Autenticação eproc A1
- Sandbox de execução automatizada no **eproc TJRS** com suporte a **Certificado Digital A1 (PFX)** e injeção de código **2FA TOTP (RFC 6238)**.
- Leitura contínua de publicações no **DJEN** (ComunicaAPI) e enriquecimento de metadados no **DataJud** do CNJ.
- Liberação automática de travas por TTL e cadência ética anti-bloqueio (concorrência = 1, backoff exponencial).

---

### 6. Auditoria de Privacidade & Dossiê Técnico
- Disponibilizado o documento `docs/CODEX_AUDIT_PROMPT.md` para auditoria independente com o OpenAI Codex, garantindo conformidade absoluta com a LGPD e ausência de dados reais (PII) ou segredos nos arquivos versionados.

---

## Como Atualizar ou Executar

### Ambiente Local (Windows)
1. Baixe o código da versão `v2.3.0` ou clone o repositório.
2. Execute `ATRIUM.bat` para verificação automática de dependências e inicialização em `http://127.0.0.1:4173`.

### Ambiente Nuvem / VPS (Linux)
```bash
# Inicialização do serviço em produção
sudo systemctl restart atrium.service
sudo systemctl status atrium.service
```
