<div align="center">

# ⚖️ JurisFlow

### Central Open Source de Gestão Jurídica, Kanban e Prazos para Escritórios de Advocacia

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20.0.0-green.svg)](https://nodejs.org/)
[![Security: AES-256-GCM](https://img.shields.io/badge/Security-AES--256--GCM-blue.svg)](#seguran%C3%A7a)
[![2FA: TOTP](https://img.shields.io/badge/2FA-TOTP%20(RFC%206238)-blueviolet.svg)](#seguran%C3%A7a)
[![White Label](https://img.shields.io/badge/White%20Label-100%25%20Customiz%C3%A1vel-gold.svg)](#personaliza%C3%A7%C3%A3o)

*Uma alternativa moderna, rápida, segura e **100% gratuita** para advogados autônomos, bancas e departamentos jurídicos no Brasil.*

[Funcionalidades](#-funcionalidades-principais) • [Instalação Rápida](#-instala%C3%A7%C3%A3o-e-execu%C3%A7%C3%A3o-local) • [Deploy na Nuvem](#-deploy-em-1-clique) • [Segurança](#-seguran%C3%A7a-e-privacidade-oab--lgpd) • [Minutas](#-gerador-de-minutas-autom%C3%A1tico)

---

</div>

## 📌 Sobre o JurisFlow

O **JurisFlow** é um sistema completo e *White Label* de gestão jurídica, desenvolvido para devolver aos advogados a autonomia, privacidade e agilidade no controle do escritório. 

Com interface visual refinada (tema *dark gold*), navegação fluida em Single Page Application (SPA) e arquitetura modular, o JurisFlow elimina a dependência de plataformas proprietárias caras e centraliza tudo o que você precisa no dia a dia forense:

- **Kanban Ágil de Prazos e Tarefas** com Timesheet integrado.
- **Gestão Processual & Honorários** com precificação (êxito, fixo, misto, mensalidade).
- **Agenda Integrada Interativa** com mapa diário e sincronização Webcal (Google Agenda/Outlook/Apple).
- **Triagem Inteligente de Intimações** com classificação jurídica automática do ato e cálculo de prazos em dias úteis.
- **Automação de Minutas Forenses** (Procuração *Ad Judicia*, Contrato de Honorários e Declaração de Hipossuficiência) geradas em 1 clique com os dados das partes.
- **Conexão com Fontes Oficiais**: Diário de Justiça Eletrônico Nacional (DJEN/CNJ), DataJud e portais judiciais com certificado A1.
- **Blindagem Criptográfica AES-256-GCM**: Seus dados ficam protegidos no seu próprio ambiente, em conformidade estrita com a LGPD e o sigilo profissional da OAB.

---

## 🌟 Funcionalidades Principais

### 1. 📊 Kanban Jurídico & Timesheet Forense
- Colunas organizadas por fluxo de trabalho: *Triagem*, *Prioridade*, *Em Andamento*, *Aguardando*, *Revisão* e *Concluída*.
- Cartões com arrastar e soltar (*drag & drop*), indicador de prioridade (*Normal*, *Importante*, *Urgente*) e responsável.
- **Timesheet integrado**: Apontamento detalhado de horas e minutos trabalhados por tarefa para prestação de contas aos clientes.
- Prazos internos e **Prazos Fatais** destacados em vermelho com contagem regressiva.

### 2. ⚖️ Gestão de Processos & Controle de Honorários
- Cadastro de processos com número CNJ, clientes, parte contrária, tribunal, comarca e vara.
- **Módulo Financeiro de Honorários**:
  - *Quota Litis / Êxito* (% sobre o proveito econômico).
  - *Honorários Fixos / Pró-labore*.
  - *Honorários Mistos* (Fixo de entrada + Êxito).
  - *Mensalidade / Partido*.
  - *Cobrança por Hora*.
  - Status financeiro: *Em dia*, *Aguardando êxito*, *Pendente* e *Quitado*.
- Ordenação interativa bidirecional (ascendente/descendente) clicando em qualquer cabeçalho da tabela (Cliente, Data de Cadastro, Tribunal, Fase, Honorários).

### 3. 📜 Gerador Automático de Minutas Forenses
- Geração instantânea de peças prontas para impressão ou cópia:
  - **Procuração "Ad Judicia et Extra"** (com poderes gerais e cláusula de poderes especiais do Art. 105 do CPC).
  - **Contrato de Prestação de Serviços Advocatícios e Honorários** (com cláusula de sucumbência autônoma do Art. 23 da Lei 8.906/94).
  - **Declaração de Hipossuficiência Econômica** (Justiça Gratuita - Art. 98 do CPC).
- Preenchimento dinâmico automático com a qualificação do cliente e os dados do seu escritório.

### 4. 📅 Agenda Integrada & Visualização Diária
- Mini-calendário com marcadores coloridos por tipo de compromisso:
  - 🟡 **Dourado**: Audiências e compromissos.
  - 🔵 **Azul**: Tarefas e prazos internos.
  - 🔴 **Vermelho**: Prazos fatais.
  - 🟢 **Verde**: Intimações publicadas.
- Clique em qualquer dia para ver a pauta completa daquela data.
- Sincronização externa com Google Agenda, Microsoft Outlook ou Apple Calendar via URL Webcal/iCalendar.

### 5. 🤖 Triagem de Intimações & Estimador de Prazos
- Classificador semântico automático de atos judiciais: *Contestação (15d)*, *Recurso/Apelação (15d)*, *Cumprimento de Sentença (15d)*, *Embargos de Declaração (5d)*, *Audiência (7d)*, *Manifestação (15d)*.
- Botão para converter intimação em tarefa do Kanban em **1 clique**, já com o prazo legal pré-calculado.

### 6. 📁 Importador Universal de Planilhas (XLSX / CSV)
- Migre de qualquer software anterior importando planilhas de contatos, processos e tarefas em lote.

---

## 🔒 Segurança e Privacidade (OAB / LGPD)

O JurisFlow foi projetado com a premissa de **Zero Trust** e sigilo forense:

| Camada | Tecnologia | Detalhes |
| :--- | :--- | :--- |
| **Criptografia em Repouso** | AES-256-GCM | Todos os dados locais (`app-state.json`, `runtime.json`) são cifrados com chaves de 256 bits. |
| **Hash de Senha** | Scrypt | Derivação de chave resistente a ataques de força bruta com GPU. |
| **Autenticação em 2 Etapas** | TOTP (RFC 6238) | Compatível com Google Authenticator, Microsoft Authenticator, 1Password, etc. |
| **Recuperação de Emergência** | 8 Códigos de uso único | Códigos HMAC-SHA256 gerados no primeiro acesso. |
| **Sessão Segura** | Cookies HttpOnly + SameSite | Cookies protegidos contra ataques XSS e Session Hijacking. |
| **Proteção de Escrita** | Token Anti-CSRF | Todas as requisições de alteração exigem validação de token CSRF. |
| **Cabeçalhos de Segurança** | CSP, HSTS, No-Sniff, Anti-Frame | `Content-Security-Policy` estrita sem execução de scripts externos não autorizados. |

---

## 🚀 Instalação e Execução Local

### Pré-requisitos
- [Node.js](https://nodejs.org/) versão **20.0.0 ou superior**.

### Passo a passo:

1. **Clone o repositório:**
   ```bash
   git clone https://github.com/seu-usuario/juris-flow.git
   cd juris-flow
   ```

2. **Instale as dependências:**
   ```bash
   npm install
   ```

3. **Inicie o servidor:**
   ```bash
   npm start
   ```

4. **Acesse no seu navegador:**
   👉 [http://localhost:4173](http://localhost:4173) ou [http://127.0.0.1:4173](http://127.0.0.1:4173)

5. **Primeiro Acesso (Setup Único)**:
   - Defina seu nome, usuário e senha administrativa forte.
   - Escaneie o QR Code no seu aplicativo autenticador no celular (2FA).
   - Guarde os códigos de recuperação em local seguro.
   - *A partir desse momento, a rota de cadastro é permanentemente travada e o sistema passa a exigir login + 2FA.*

---

## ☁️ Deploy em 1 Clique

### Opção A: Docker Compose (Qualquer Servidor / VPS)

O projeto já inclui o `docker-compose.yml` e `Dockerfile` configurados:

```bash
docker compose up -d
```
O painel estará disponível na porta `4173` com volume persistente montado em `./data`.

---

### Opção B: Render

1. Crie uma conta em [render.com](https://render.com).
2. Clique em **New +** $\to$ **Web Service** e conecte seu repositório do GitHub.
3. O Render detectará automaticamente o arquivo `render.yaml` e o `Dockerfile`.
4. Preencha as variáveis de ambiente:
   - `NODE_ENV`: `production`
   - `COOKIE_SECURE`: `true`
   - `AUTH_SESSION_SECRET`: Gerado via `npm run setup:keys`
   - `AUTH_ENCRYPTION_KEY`: Gerado via `npm run setup:keys`
5. Clique em **Create Web Service** e sua Central estará no ar com link HTTPS em menos de 2 minutos.

---

### Opção C: Vercel

1. Importe o repositório no painel da [Vercel](https://vercel.com).
2. O arquivo `vercel.json` configurará as rotas e funções serverless automaticamente.
3. Configure as variáveis de ambiente e clique em **Deploy**.

---

## 🛠️ Personalização (White Label)

O JurisFlow é 100% personalizável para a identidade visual do seu escritório:

1. Acesse o menu **Configurações** na barra lateral.
2. Na aba **Identidade do Escritório**, personalize:
   - **Nome do Escritório** (Ex: *Silva & Santos Advogados Associados*)
   - **Advogado(a) Titular** (Ex: *Dra. Maria Santos*)
   - **Número de Inscrição na OAB** (Ex: *OAB/SP 123.456*)
   - **Endereço Profissional, E-mail e WhatsApp**
   - **URL da Agenda Externa** (Link Webcal do Google Agenda, Outlook ou Apple)
3. Todas as minutas contratuais, procurações e cabeçalhos do sistema serão atualizados automaticamente com os seus dados!

---

## 🧪 Testes Automatizados & Auditoria

O projeto conta com uma suíte rigorosa de 5 baterias de testes automatizados:

```bash
# Executar todos os testes de conformidade
npm test
```

Suítes incluídas:
- `tests/security.mjs`: Autenticação scrypt, TOTP, cookies HttpOnly, rate limiting, CSP e AES-256.
- `tests/importer.mjs`: Importação de planilhas XLSX, deduplicação e proteção de PII.
- `tests/rls.mjs`: Políticas de banco de dados e Row Level Security (RLS AAL2).
- `tests/collector.mjs`: Conectores judiciais (DJEN, DataJud, PJe).
- `tests/smoke.mjs`: Teste End-to-End completo via Playwright (login, 2FA, kanban, timesheet, honorários, minutas).

---

## 📄 Licença

Distribuído sob a licença **MIT**. Consulte o arquivo [`LICENSE`](LICENSE) para obter mais informações. Você é livre para utilizar, modificar e distribuir este software para fins pessoais ou comerciais.

---

<div align="center">
  <sub>Desenvolvido com ⚖️ para fortalecer a advocacia brasileira independente.</sub>
</div>
