<div align="center">

# 🏛️ Atrium Senda

### Plataforma de Gestão Jurídica Inteligente, Soberana e Autônoma

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20.0.0-green.svg)](https://nodejs.org/)
[![Security: AES-256-GCM](https://img.shields.io/badge/Security-AES--256--GCM-blue.svg)](#segurança-e-privacidade-zero-trust)
[![2FA: TOTP](https://img.shields.io/badge/2FA-TOTP%20(RFC%206238)-blueviolet.svg)](#segurança-e-privacidade-zero-trust)
[![Design: Bento Grid](https://img.shields.io/badge/UI-Bento%20Grid%20Dark%20Gold-gold.svg)](#design-system--filosofia-visual)
[![AI: Google Gemini](https://img.shields.io/badge/AI-Google%20Gemini%20API-teal.svg)](#assistente-jurídico-ia-gemini)

*Uma alternativa moderna, rápida, segura e **100% autônoma** para advogados autônomos, bancas e departamentos jurídicos no Brasil.*

[Origem do Nome](#-origem--justificativa-do-nome) • [Funcionalidades](#-funcionalidades-principais) • [Design System](#-design-system--filosofia-visual) • [Instalação Rápida](#-instalação-e-execução-local) • [Segurança](#-segurança-e-privacidade-zero-trust)

---

</div>

## 🏛️ Origem & Justificativa do Nome

O nome **Atrium Senda** foi cuidadosamente selecionado para refletir a essência, a modernidade e a autonomia da advocacia contemporânea, utilizando uma combinação original de latim e português:

### 1. Atrium (Átrio)
- **Contexto Histórico**: O *atrium* era o local central de encontro e recepção em uma casa romana, o ponto onde tudo convergia e se organizava.
- **Significado no Software**: Representa a **centralização única** que o software oferece. É o ponto de convergência onde o advogado centraliza todos os seus processos, tarefas, agenda e finanças. Simboliza a "primeira linha de defesa" e o controle total do escritório, refletindo a premissa de **Zero Trust** e a segurança robusta.

### 2. Senda
- **Contexto**: Palavra que denota caminho, trilha, fluxo, rumo ou vereda.
- **Significado no Software**: Representa o **fluxo de trabalho contínuo e a gestão de prazos**. Toca nas funcionalidades de Kanban, controle de prazos em dias úteis (CPC/2015), triagem inteligente de intimações e automação de minutas. O software é a senda segura pela qual a rotina jurídica transcorre sem riscos de perda de prazo.

---

## 🌟 Funcionalidades Principais

### 1. 📊 Dashboard Bento Grid & Distribuição Semanal
- **Layout Bento Moderno**: Compartimentos executivos harmoniosos com métricas em tempo real, foco do dia, linha do tempo de auditoria e monitoramento de fontes.
- **Gráfico de Distribuição Semanal**: Visualização gráfica de colunas verticais com o volume de prazos de segunda a sexta-feira, cálculo de média diária e taxa de pontualidade 100%.

### 2. 🤖 Assistente Jurídico IA (Google Gemini)
- Integração nativa com a API gratuita do **Google Gemini** (Google AI Studio).
- Cadastro e validação da chave API diretamente pela interface, com armazenamento criptografado exclusivo no servidor (a chave não retorna ao navegador).
- Leitura, síntese e extração de teses e pedidos de publicações e intimações.
- O sistema envia ao Google apenas a pergunta, o histórico recente e os registros relacionados à consulta; perguntas jurídicas gerais não incluem o acervo interno.
- Respostas sobre prazos são estimativas auxiliares e exigem conferência humana no processo e no calendário oficial.

### 3. ⚖️ Triagem Inteligente de Intimações & DJEN Oficial
- Conectado diretamente à API pública oficial do **Diário de Justiça Eletrônico Nacional (DJEN / CNJ)**.
- Consulta limpa por número de OAB e Estado (sem loops ou erros 429).
- Classificação semântica automática do ato: *Contestação (15d)*, *Apelação (15d)*, *Embargos de Declaração (5d)*, *Manifestação (15d)*.
- **Visualização da Publicação com Destaque**: Texto integral com decodificação universal de caracteres e botão direto *"✦ Analisar com IA"*.
- **Ordenação Direta por Clique**: Cabeçalhos clicáveis de *Data* e *Prazo* para reordenar instantaneamente.

### 4. 🗂️ Kanban Jurídico & Timesheet Forense
- Colunas organizadas por fluxo de trabalho: *Triagem*, *Em Elaboração*, *Revisão* e *Concluídas*.
- Cartões com arrastar e soltar (*drag & drop*), indicador de prioridade (*Normal*, *Importante*, *Urgente*) e responsável.
- **Timesheet integrado**: Apontamento detalhado de minutos trabalhados por tarefa para prestação de contas.
- Prazos fatais destacados em vermelho com contagem regressiva em dias úteis.

### 5. 📜 Gerador Automático de Minutas Forenses
- Geração instantânea de peças prontas para cópia ou download em Markdown/Texto:
  - **Procuração "Ad Judicia et Extra"** (com poderes especiais do Art. 105 do CPC).
  - **Contrato de Prestação de Serviços Advocatícios e Honorários** (com percentual de êxito ou valor fixo).
  - **Declaração de Hipossuficiência Econômica** (Justiça Gratuita - Art. 98 do CPC).
- Cabeçalho formal automático com a identidade e dados do escritório.

### 6. 📁 Importador eproc (.XLS) & Universal (XLSX / CSV)
- Importe relatórios exportados diretamente do **eproc (TJRS, TRF4, TJSC, TJSP)** ou qualquer planilha Excel.
- Pré-visualização completa, mapeamento inteligente de colunas e consolidação deduplicada.

### 7. 📅 Agenda Integrada & Sincronização Externa
- Mini-calendário com mapa de calor diário por categoria (audiências, prazos fatais, tarefas).
- Conexão simplificada por formulário no sistema com qualquer agenda externa (Google Agenda, Microsoft Outlook, Apple Calendar) via URL iCal/Webcal.

---

## 🎨 Design System & Filosofia Visual

O Atrium Senda adota uma identidade visual imersiva e sofisticada baseada em:

- **Paleta Dark Gold**:
  - `#0C0C0B` / `#121212`: Negro Metálico Profundo.
  - `#D4AF37` / `#C9A84C`: Dourado Escovado e Reflexos Nobres.
  - `#FDF3C6` / `#F5E6A3`: Brilho especular dourado.
  - `#404040`: Cinza Carvão para linhas de suporte e bordas.
  - `#CC3333`: Vermelho Fatais para prazos e urgências críticas.
- **Tipografia**: Serifada monumental (`Cinzel` / `Playfair Display`) para prestígio institucional combinada com sans-serif geométrica legível (`Plus Jakarta Sans` / `Inter`) para dados técnicos.
- **Monograma AS Oficial**: Entrelace monumental da letra *A* com a letra *S*, desenhando no centro o caminho em perspectiva da *Senda*.
- **Neo-Brutalismo Sutil**: Bordas finas de 1px com brilho dourado, cantos suaves (14–16px) e micro-interações táteis de elevação no hover.

---

## 🔒 Segurança e Privacidade (Zero Trust)

| Camada | Tecnologia | Detalhes |
| :--- | :--- | :--- |
| **Criptografia em Repouso** | AES-256-GCM | Todos os dados locais (`app-state.json`, `runtime.json`) são cifrados com chaves de 256 bits. |
| **Hash de Senha** | Scrypt | Derivação de chave resistente a ataques de força bruta. |
| **Autenticação em 2 Etapas** | TOTP (RFC 6238) | Compatível com Google Authenticator, Microsoft Authenticator, 1Password, etc. |
| **Recuperação de Emergência** | 8 Códigos de uso único | Códigos HMAC-SHA256 gerados no primeiro acesso. |
| **Sessão Segura** | Cookies HttpOnly + SameSite | Cookies protegidos contra ataques XSS e sequestro de sessão. |
| **Proteção de Escrita** | Token Anti-CSRF | Todas as requisições de alteração exigem validação de token CSRF. |
| **Cabeçalhos de Segurança** | CSP, HSTS, No-Sniff, Anti-Frame | `Content-Security-Policy` estrita. |

---

## 🚀 Instalação e Execução Local

### Pré-requisitos
- [Node.js](https://nodejs.org/) versão **20.0.0 ou superior**.

### Passo a passo:

1. **Clone o repositório:**
   ```bash
   git clone https://github.com/ricarossetto/Atrium-Senda.git
   cd Atrium-Senda
   ```

2. **Instale as dependências:**
   ```bash
   corepack enable
   pnpm install --frozen-lockfile
   ```

3. **Inicie o servidor:**
   ```bash
   pnpm start
   ```

4. **Acesse no seu navegador:**
   👉 [http://localhost:4173](http://localhost:4173) ou [http://127.0.0.1:4173](http://127.0.0.1:4173)

5. **Primeiro Acesso (Setup Único)**:
   - Crie seu usuário e senha administrativa forte.
   - Escaneie o QR Code no seu aplicativo autenticador no celular (2FA).
   - Guarde os 8 códigos de recuperação em local seguro.
   - A rota de cadastro é permanentemente travada após a inicialização.

---

## 🧪 Testes Automatizados

```bash
# Executar a suíte de testes de conformidade
npm test
```

Suítes incluídas:
- `tests/security.mjs`: Autenticação scrypt, TOTP, cookies HttpOnly, rate limiting, CSP e AES-256.
- `tests/importer.mjs`: Importação de planilhas XLSX/XLS e relatórios eproc.
- `tests/rls.mjs`: Políticas de isolamento e Row Level Security.
- `tests/collector.mjs`: Conectores judiciais (DJEN, DataJud, PJe).
- `tests/smoke.mjs`: Teste End-to-End completo (login, 2FA, kanban, timesheet, honorários, minutas, termos OAB/UF e ordenação).

---

## 📄 Licença

Distribuído sob a licença **MIT**. Consulte o arquivo [`LICENSE`](LICENSE) para obter mais informações.

<div align="center">
  <sub>Atrium Senda — Desenvolvido com rigor e excelência para fortalecer a advocacia brasileira independente.</sub>
</div>
