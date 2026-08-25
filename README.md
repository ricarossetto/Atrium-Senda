<div align="center">

# 🏛️ Atrium — Escritório Integrado

### Plataforma de Gestão Jurídica Inteligente, Soberana e Autônoma (v2.0)

[![Version: 2.0.0](https://img.shields.io/badge/Version-2.0.0-gold.svg)](package.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20.0.0-green.svg)](https://nodejs.org/)
[![Security: AES-256-GCM](https://img.shields.io/badge/Security-AES--256--GCM-blue.svg)](#-segurança-e-privacidade-zero-trust)
[![2FA: TOTP](https://img.shields.io/badge/2FA-TOTP%20(RFC%206238)-blueviolet.svg)](#-segurança-e-privacidade-zero-trust)
[![A1 Sandbox: mTLS](https://img.shields.io/badge/A1%20Sandbox-mTLS%20Local-purple.svg)](#-sandbox-local-de-certificado-a1-mtls)
[![UI: Dark Gold & Light Pergaminho](https://img.shields.io/badge/UI-Dual%20Theme%20(100%25)-amber.svg)](#-design-system--filosofia-visual)
[![AI: Google Gemini](https://img.shields.io/badge/AI-Google%20Gemini%20API-teal.svg)](#-assistente-jurídico-ia-gemini)
[![Tests: 11 Suites Passing](https://img.shields.io/badge/Tests-11%2F11%20Passing%20(100%25)-brightgreen.svg)](#-testes-automatizados)

*A mais completa alternativa soberana, moderna e segura para advogados autônomos, bancas boutique e departamentos jurídicos no Brasil.*

[Funcionalidades](#-funcionalidades-principais) • [Sandbox A1](#-sandbox-local-de-certificado-a1-mtls) • [Boletim por E-mail](#-boletim-de-publicações-por-e-mail-estilo-astrea) • [Design System](#-design-system--filosofia-visual) • [Instalação Rápida](#-instalação-e-execução-local) • [Guia do Testador](#-guia-do-testador-beta)

---

</div>

## 🏛️ Sobre o Atrium

O **Atrium** (do latim *atrium*, o pátio central da arquitetura clássica onde as grandes decisões convergiam e se organizavam) é uma plataforma open-source desenvolvida para entregar **soberania de dados, automação processual e controle total da banca jurídica**, sem mensalidades abusivas nem dependência de nuvens fechadas.

Na versão **2.0**, o sistema consolida o melhor das principais plataformas do mercado (Astrea, Projuris, ADVBOX e Legal One) em uma arquitetura de **Ambiente Local Seguro (Zero Trust)** com suporte completo ao Windows e à nuvem soberana.

---

## 🌟 Funcionalidades Principais

### 1. 🧪 Sandbox Local de Certificado A1 (mTLS)
- **Validação Local em 9 Passos**: Testa integridade do PFX, senha, validade temporal, chave privada, assinatura de nonce criptográfico SHA-256 e handshake TLS real via Playwright Chromium.
- **Resolução Nativa OpenSSL 3**: Suporte transparente a certificados brasileiros ICP-Brasil legados (RC2-40-CBC / 3DES) modernizados em memória.
- **Zero Vazamento**: O arquivo `.pfx` e a senha nunca deixam o computador local do advogado.

### 2. 🔐 Segundo Fator TOTP / QR Code (RFC 6238)
- Leitura instantânea de QR Codes de tribunais (`otpauth://`) e arquivos de exportação do Google Authenticator (`otpauth-migration://` decodificados via Protobuf).
- Descarte imediato da imagem do QR code após leitura em memória.
- Verificação automática de desvio de relógio do sistema.

### 3. 📧 Boletim de Publicações por E-mail (Estilo Astrea)
- Consolidação diária automática das intimações do DJEN e tribunais.
- Disparo direto via SMTP ou abertura em 1-clique no Gmail Web / Thunderbird.

### 4. 🤖 Assistente Jurídico IA (Google Gemini) com Zero-Trust
- Integração nativa com a API do **Google Gemini** (Gemini 2.5 Flash / Flash Lite).
- Minimização de dados estrita: exclusão automática de dados sensíveis de clientes antes do envio para a IA.

### 5. 🗂️ Kanban Jurídico & Controle de Prazos Fatais (CPC/2015)
- Fluxo de trabalho ágil com pontuação **TaskScore (ADVBOX)** e apontamento de horas (**TimeSheet**).
- Contagem em dias úteis (Art. 219 do CPC) e suspensão no Recesso Forense (Art. 220 do CPC).

### 6. 💰 Gestão Financeira, Requisições Judiciais & CRM
- Controle de honorários (Quota Litis %, Fixo, Horas).
- Acompanhamento de **RPVs Federais (TRF4)** e **Alvarás (TJRS / TRT4)** com cálculo automático de retenção e repasse líquido.

### 7. 📜 Gerador Automático de Minutas Forenses
- Procurações *Ad Judicia*, Contratos de Honorários, Declarações de Hipossuficiência e Prestações de Contas geradas em segundos.

### 8. 📁 Importador Universal de Planilhas
- Importe relatórios do **ADVBOX, Legal One, Astrea, eproc** ou planilhas `.xlsx`/`.csv` com deduplicação inteligente.

---

## 🎨 Design System & Filosofia Visual

1. **Dark Gold (Tema Padrão)**: Preto metálico nobre com acentos em Dourado Imperial escovado.
2. **Light Pergaminho (Tema Claro)**: Branco pérola e marfim pergaminho com tipografia contrastante e legibilidade cristalina.

---

## 🔒 Segurança e Privacidade (Zero Trust)

| Camada | Tecnologia | Benefício |
| :--- | :--- | :--- |
| **Criptografia em Repouso** | AES-256-GCM (Scrypt) | Todos os dados locais e credenciais são cifrados com chaves de 256 bits. |
| **Autenticação em 2 Etapas** | TOTP (RFC 6238) | Compatível com Google Authenticator, 1Password, etc. |
| **Backups Criptografados** | Arquivo `.atrium-backup` | Backup e restauração com assinatura HMAC e snapshot de segurança. |
| **Certificado A1 & PJe** | Sandbox Local mTLS | Chaves privadas e senhas nunca trafegam em rede externa. |
| **Proteção Web** | CSRF Token + CSP Estrita + HttpOnly | Cookies protegidos contra XSS, Hijacking e requisições cruzadas. |

---

## 🚀 Instalação e Execução Local

### Pré-requisitos
- [Node.js](https://nodejs.org/) versão **20.0.0 ou superior**.

### Inicialização Rápida no Windows (1-Clique):
Dê um duplo clique no arquivo **`iniciar-atrium.bat`** na pasta do projeto. O navegador abrirá automaticamente em:
👉 **[http://localhost:4173](http://localhost:4173)**

### Inicialização via Terminal:
```bash
# 1. Clone o repositório
git clone https://github.com/ricarossetto/Atrium-Senda.git
cd Atrium-Senda

# 2. Instale as dependências
npm install

# 3. Inicie o servidor
npm start
```

---

## 📖 Guia do Testador Beta

Para um passo a passo detalhado voltado para advogados não técnicos, consulte o [**Guia do Testador Beta**](docs/BETA_TESTER_GUIDE.md).

---

## 🧪 Testes Automatizados

O Atrium possui 11 suítes de teste automatizadas com 100% de cobertura operacional:

```bash
npm test
```

### Suítes Validadas:
- ✓ **Sintaxe e Módulos**: Verificação estrita de todos os arquivos JS/MJS.
- ✓ **Segurança e Criptografia**: Scrypt, TOTP, cookies HttpOnly, rate limit, CSP e AES-256-GCM.
- ✓ **Importador de Planilhas**: XLSX/CSV e relatórios de processo.
- ✓ **Políticas Supabase & RLS**: Isolamento estrito AAL2.
- ✓ **Coletores Judiciais**: DJEN, DataJud e PJe sem ciência automática.
- ✓ **Regras de Negócio & Catálogos**: 86 tipos de ação, 140 tarefas TaskScore e TimeSheet.
- ✓ **Recursos Open-Source**: Cálculos de RPV/Alvará e CPC Art. 220.
- ✓ **Minimização de Dados na IA**: Proteção de PII no contexto Gemini.
- ✓ **Deployment e Nuvem**: Compatibilidade Render Cloud e guards de produção.
- ✓ **Diagnósticos & Backups Criptografados**: Exportação `.atrium-backup` e feedback.
- ✓ **Integração Judicial & A1 Sandbox**: Validação mTLS local Playwright e TOTP engine.
- ✓ **Smoke Test End-to-End Playwright**: Teste funcional completo da interface e Kanban.

---

## 📄 Licença

Distribuído sob a licença **MIT**. Consulte o arquivo [`LICENSE`](LICENSE) para mais informações.

<div align="center">
  <sub>Atrium — Desenvolvido com excelência técnica para empoderar a advocacia brasileira independente.</sub>
</div>
