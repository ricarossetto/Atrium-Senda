<div align="center">

# 🏛️ Atrium — Escritório Integrado

### Plataforma de Gestão Jurídica Inteligente, Soberana e Autônoma (v2.0)

[![Version: 2.0.0](https://img.shields.io/badge/Version-2.0.0-gold.svg)](package.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20.0.0-green.svg)](https://nodejs.org/)
[![Security: AES-256-GCM](https://img.shields.io/badge/Security-AES--256--GCM-blue.svg)](#-segurança-e-privacidade-zero-trust)
[![2FA: TOTP](https://img.shields.io/badge/2FA-TOTP%20(RFC%206238)-blueviolet.svg)](#-segurança-e-privacidade-zero-trust)
[![UI: Dark Gold & Light Pergaminho](https://img.shields.io/badge/UI-Dual%20Theme%20(100%25)-amber.svg)](#-design-system--filosofia-visual)
[![AI: Google Gemini](https://img.shields.io/badge/AI-Google%20Gemini%20API-teal.svg)](#-assistente-jurídico-ia-gemini)
[![Tests: 8 Suites Passing](https://img.shields.io/badge/Tests-100%25%20Passing-brightgreen.svg)](#-testes-automatizados)

*A mais completa alternativa soberana, moderna e segura para advogados autônomos, bancas boutique e departamentos jurídicos no Brasil.*

[Funcionalidades](#-funcionalidades-principais) • [Boletim por E-mail](#-boletim-de-publicações-por-e-mail-estilo-astrea) • [Design System](#-design-system--filosofia-visual) • [Instalação Rápida](#-instalação-e-execução-local) • [Segurança](#-segurança-e-privacidade-zero-trust)

---

</div>

## 🏛️ Sobre o Atrium

O **Atrium** (do latim *atrium*, o pátio central da arquitetura clássica onde as grandes decisões convergiam e se organizavam) é uma plataforma open-source desenvolvida para entregar **soberania de dados, automação processual e controle total da banca jurídica**, sem mensalidades abusivas nem dependência de nuvens fechadas.

Na versão **2.0**, o sistema consolida o melhor das principais plataformas do mercado (Astrea, Projuris, ADVBOX e Legal One) em uma arquitetura ultra-rápida de **Ambiente Local Seguro (Zero Trust)**.

---

## 🌟 Funcionalidades Principais

### 1. 📧 Boletim de Publicações por E-mail (Estilo Astrea — 100% Grátis)
- **Consolidação Automática**: Gera e-mails diários estruturados com todas as publicações e intimações capturadas no DJEN e tribunais.
- **Layout Responsivo Profissional**:
  - Cabeçalho executivo com número total de intimações e data do boletim.
  - Cards detalhados com Tribunal, Vara/Comarca, datas de disponibilização e publicação, link direto do processo CNJ, partes e advogados com OAB.
  - Inteiro teor integral com quebras de linha e formatação jurídica preservadas.
- **Múltiplos Métodos de Disparo**:
  - 🚀 **Envio Direto SMTP**: Integração configurável com Gmail, Outlook ou servidor de e-mail próprio.
  - 🌐 **Abrir no Gmail Web**: Abre o Gmail com 1 clique já com o destinatário, assunto e corpo prontos (sem custo de API).
  - 📋 **Copiar HTML / Baixar Arquivo**: Cópia com 1 clique para colar no Thunderbird, Outlook Desktop ou arquivar em `.html`.

### 2. 🤖 Assistente Jurídico IA (Google Gemini) com Zero-Trust
- Integração nativa com a API gratuita do **Google Gemini** (Google AI Studio).
- Armazenamento da chave API 100% criptografado no servidor local (a chave nunca retorna ao navegador).
- **Minimização de Dados Estrita**: A IA só recebe o extrato da publicação e histórico contextual relevante, mantendo a privacidade de clientes protegida.
- Análise semântica de decisões, identificação de teses recursais e estimativa de prazos.

### 3. ⚖️ Triagem Inteligente de Intimações & DJEN Oficial
- Conexão direta com a API pública oficial do **Diário de Justiça Eletrônico Nacional (DJEN / CNJ)**.
- Consulta limpa por número de OAB e UF sem risco de bloqueio.
- Classificação de atos processuais (Contestação, Apelação, Embargos de Declaração, Réplica, Manifestação).
- Filtro de corte inteligente: foco em publicações "Daqui para frente" para manter a caixa limpa.

### 4. 🗂️ Kanban Jurídico & Controle de Prazos Fatais (CPC/2015)
- Fluxo de trabalho ágil: *Triagem*, *Em Elaboração*, *Revisão* e *Concluídas*.
- **Contagem em Dias Úteis (Art. 219 do CPC)** e suspensão no **Recesso Forense (Art. 220 do CPC)**.
- Cartões interativos com arrastar e soltar (*drag & drop*), pontuação TaskScore e responsável.
- Conclusão com 1 clique tanto no card quanto no pop-up de edição.

### 5. 💰 Gestão Financeira, Requisições Judiciais & CRM de Atendimentos
- Controle de honorários contratuais (*Quota Litis %*, *Pró-Labore Fixo*, *Mensalidade* e *Horas*).
- **Requisições de Pagamento (RPV / Alvarás)**:
  - RPVs Federais e Precatórios (TRF4).
  - Alvarás Judiciais Estaduais (TJRS) e Trabalhistas (TRT4).
  - Cálculo automático de repasse ao cliente e retenção de honorários.
- CRM de Captação e Atendimento a Clientes (*Leads*).

### 6. 📜 Gerador Automático de Minutas Forenses
- Minutas completas geradas instantaneamente a partir dos dados do processo e cliente:
  - **Procuração Ad Judicia et Extra** (com poderes especiais do Art. 105 do CPC).
  - **Contrato de Honorários Advocatícios** (Quota Litis / Fixo).
  - **Declaração de Hipossuficiência Econômica** (Justiça Gratuita - Art. 98 do CPC).
  - **Prestação de Contas de RPV / Alvará**.

### 7. 📁 Importador Universal de Planilhas (eproc / Projuris / Excel)
- Importe relatórios exportados do **eproc (TJRS, TRF4, TJSC, TJSP)** ou qualquer planilha `.xlsx`/`.csv`.
- Mapeamento dinâmico de colunas e deduplicação inteligente.

---

## 🎨 Design System & Filosofia Visual

O Atrium v2.0 possui suporte completo a **dois temas oficiais 100% polidos**:

1. **Dark Gold (Tema Padrão)**:
   - Base preto metálico nobre (`#0C0C0B` / `#121212`) com acentos em Dourado Imperial escovado (`#D4AF37` / `#C5A880`).
   - Alto prestígio institucional e redução drástica do cansaço visual em longas jornadas.

2. **Light Pergaminho (Tema Claro)**:
   - Base em branco pérola e marfim pergaminho (`#FAF9F5` / `#F3EEE3`) com bordas suaves (`#E2D9CD`) e tipografia contrastante em grafite escuro (`#1A1A1C`).
   - Modais, campos de formulário, kanban e banners com legibilidade cristalina.

---

## 🔒 Segurança e Privacidade (Zero Trust)

| Camada | Tecnologia | Benefício |
| :--- | :--- | :--- |
| **Criptografia em Repouso** | AES-256-GCM | Todos os dados locais (`app-state.json`, `runtime.json`) são cifrados com chaves simétricas de 256 bits. |
| **Hash de Senha** | Scrypt | Algoritmo resistente a ataques de força bruta e GPU. |
| **Autenticação em 2 Etapas** | TOTP (RFC 6238) | Compatível com Google Authenticator, Microsoft Authenticator, 1Password, etc. |
| **Recuperação de Emergência** | Códigos HMAC de Uso Único | 8 códigos descartáveis gerados no setup do administrador. |
| **Certificado A1 & PJe** | Isolamento Local Seguro | O arquivo `.pfx` e a senha nunca deixam o dispositivo local. |
| **Proteção Web** | CSRF Token + CSP Estrita + HttpOnly | Cookies protegidos contra XSS, Session Hijacking e ataques CSRF. |

---

## 🚀 Instalação e Execução Local

### Pré-requisitos
- [Node.js](https://nodejs.org/) versão **20.0.0 ou superior**.

### Inicialização Rápida:

```bash
# 1. Clone o repositório
git clone https://github.com/ricarossetto/Atrium-Senda.git
cd Atrium-Senda

# 2. Instale as dependências
npm install

# 3. Inicie o servidor principal (Porta 5000)
npm start
```

Acesse no seu navegador: 👉 **[http://127.0.0.1:5000](http://127.0.0.1:5000)**

---

## 🧪 Testes Automatizados

O Atrium conta com uma suíte abrangente de testes automatizados:

```bash
npm test
```

### Relatório de Suítes:
- ✓ **Segurança e Criptografia**: Scrypt, TOTP, cookies HttpOnly, rate limit, CSP e AES-256-GCM.
- ✓ **Importador de Planilhas**: XLSX/XLS e relatórios do eproc.
- ✓ **Políticas Supabase & RLS**: Isolamento estrito AAL2.
- ✓ **Coletores Judiciais**: DJEN, DataJud e PJe.
- ✓ **Regras de Negócio & Catálogos**: Tipos de ação, TaskScore e TimeSheet.
- ✓ **Recursos Open-Source**: Cálculos de RPV e contagem do Art. 220 CPC.
- ✓ **Minimização de Dados na IA**: Proteção de PII no contexto Gemini.
- ✓ **Smoke Test End-to-End Playwright**: Teste funcional completo da interface e Kanban.

---

## 📄 Licença

Distribuído sob a licença **MIT**. Consulte o arquivo [`LICENSE`](LICENSE) para mais informações.

<div align="center">
  <sub>Atrium — Desenvolvido com excelência técnica para empoderar a advocacia brasileira independente.</sub>
</div>
