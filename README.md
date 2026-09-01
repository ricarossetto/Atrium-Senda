<div align="center">

# 🏛️ ATRIUM — Escritório Integrado

### Gestão jurídica local-first, segura e supervisionada (v2.0 Beta)

[![Version: 2.0.0](https://img.shields.io/badge/Version-2.0.0-gold.svg)](package.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js 24](https://img.shields.io/badge/Node.js-24.x-green.svg)](https://nodejs.org/)
[![Security: AES-256-GCM](https://img.shields.io/badge/Security-AES--256--GCM-blue.svg)](#segurança-e-privacidade)
[![2FA: TOTP](https://img.shields.io/badge/2FA-TOTP%20RFC%206238-blueviolet.svg)](#segurança-e-privacidade)
[![Validation: CI gated](https://img.shields.io/badge/Validation-CI%20gated-brightgreen.svg)](#testes-automatizados)

</div>

## Sobre o ATRIUM

O ATRIUM é um workspace open source e local-first para escritórios jurídicos. A versão Beta atual centraliza processos, contatos, publicações e intimações, tarefas/Kanban, agenda, financeiro, documentos e integrações judiciais, mantendo os dados do escritório sob controle local e cifrado.

A UI V2 é a interface visual padrão. A UI Clássica permanece disponível como fallback selecionável; ambas operam sobre o mesmo App, o mesmo Store, o mesmo backend e as mesmas regras de negócio, sem duplicação de dados ou autoridades funcionais.

A IA, quando configurada, atua de forma assistencial e com contexto minimizado. Confirmação de prazos, envio de e-mail, ciência judicial e demais ações sensíveis permanecem sob supervisão humana.

O armazenamento Beta usa JSON cifrado com AES-256-GCM, revisionamento otimista e gravações atômicas. SQLite permanece uma possibilidade de evolução futura; não é o armazenamento atual.

## Funcionalidades atuais

- Processos, contatos, leads, tarefas/Kanban, agenda, financeiro e documentos.
- Discovery judicial DJEN → número CNJ → DataJud → processo/contatos, sempre em modo de leitura e sem produzir ciência judicial.
- Triagem de publicações com estados de tratamento separados de read/unread.
- SMTP configurável para teste manual, envio manual de publicação individual e boletim em lote manual. O backend resolve a publicação canônica antes do envio; não existe envio automático.
- Tarefas originadas de publicações começam sem deadline. A data fatal só é registrada após conferência e confirmação humana; a IA pode oferecer apenas estimativa preliminar, nunca prazo jurídico definitivo.
- Assistente com Google Gemini quando uma chave é configurada, com minimização do contexto enviado. Sem chave, a integração aparece como não configurada; não há modelo local embutido.
- Certificado A1 em sandbox local e integrações judiciais administradas, sem persistir certificado ou senha em logs.
- Feedback Beta registrado somente no ambiente local e cifrado em repouso. O conteúdo não é transmitido automaticamente a terceiros.

## Segurança e privacidade

| Camada | Implementação atual |
| :--- | :--- |
| Estado local | AES-256-GCM, revision, gravação atômica e modo de recuperação para app-state |
| Runtime derivado | AES-256-GCM, quarentena preservadora em caso de corrupção e rebuild explícito |
| Autenticação | Senha forte, sessão HttpOnly/SameSite, CSRF e TOTP RFC 6238 opcional por usuário |
| Backups | Arquivo `.atrium-backup` cifrado, checksum SHA-256 e snapshot pré-restauração |
| Segredos | Arquivos privados com permissão restritiva quando suportada; chaves não retornam ao frontend |
| E-mail | Transporte SMTP único no backend, autorização administrativa e ação exclusivamente manual |

## Instalação e execução local

### Pré-requisitos

- Node.js **24.x**.
- Corepack, incluído na distribuição oficial do Node.js.

### Windows

Dê duplo clique em `iniciar-atrium.bat`. O starter valida Node.js 24 e Corepack, executa `pnpm@11.19.0` diretamente por `corepack pnpm`, instala pelo lockfile congelado quando necessário, prepara o Chromium local do Playwright somente se estiver ausente e abre `http://127.0.0.1:4173` após o servidor responder. O fluxo normal não exige `corepack enable` nem privilégios administrativos.

### Terminal

```bash
git clone https://github.com/ricarossetto/Atrium-Senda.git
cd Atrium-Senda
corepack --version
corepack pnpm --version
corepack pnpm install --frozen-lockfile
corepack pnpm start
```

## Testes automatizados

A suíte canônica integral, registrada em `tests/run-all.mjs`, cobre segurança, concorrência do Store, recuperação do runtime, migrações de segredo, primeira persistência de instalação nova, QR TOTP sintético, contrato de sincronização, backup/restore, integrações judiciais, módulos frontend, acessibilidade, E2E e Visual QA. A contagem exata pertence a cada execução do CI para não tornar esta documentação obsoleta.

```bash
corepack pnpm check
corepack pnpm test
```

O CI usa Node 24, `pnpm@11.19.0` e `pnpm install --frozen-lockfile`. O fluxo A1 completo é validado no job Windows; testes locais em outros sistemas não substituem essa autoridade.

## Estado e limitações do Beta

- Estado técnico: **UI V2 MIGRATION COMPLETE** na baseline técnica da branch `ui-v2`, condicionada à suíte canônica integral e aos jobs Lint/Test/E2E, A1 Windows e Visual QA no mesmo HEAD.
- O feedback permanece local; o mantenedor só o recebe se o usuário exportar ou compartilhar deliberadamente o registro.
- DJEN/DataJud e portais dependem de disponibilidade, credenciais e configuração do ambiente.
- Ações oficiais, ciência judicial, envio de e-mail e confirmação de prazo permanecem sob responsabilidade humana.
- A UI V2 permanece padrão e a UI Clássica continua sendo fallback visual. Essa conclusão técnica não equivale a release final, certificação de produção, certificação jurídica ou garantia de disponibilidade dos serviços externos.

Consulte também o [Guia do Testador Beta](docs/BETA_TESTER_GUIDE.md), o [checklist de readiness](docs/development/BETA_READINESS.md) e o [roadmap](docs/development/ROADMAP.md).

## Licença

Distribuído sob a licença MIT. Consulte [`LICENSE`](LICENSE).
