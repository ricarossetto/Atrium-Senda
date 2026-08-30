<div align="center">

# 🏛️ ATRIUM — Escritório Integrado

### Gestão jurídica local com armazenamento cifrado e fluxos supervisionados (v2.0 Beta)

[![Version: 2.0.0](https://img.shields.io/badge/Version-2.0.0-gold.svg)](package.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js 24](https://img.shields.io/badge/Node.js-24.x-green.svg)](https://nodejs.org/)
[![Security: AES-256-GCM](https://img.shields.io/badge/Security-AES--256--GCM-blue.svg)](#segurança-e-privacidade)
[![2FA: TOTP](https://img.shields.io/badge/2FA-TOTP%20RFC%206238-blueviolet.svg)](#segurança-e-privacidade)
[![Tests: 55 suites](https://img.shields.io/badge/Tests-55%20suites-brightgreen.svg)](#testes-automatizados)

</div>

## Sobre o ATRIUM

O ATRIUM é uma aplicação open-source de gestão de escritório jurídico. A versão Beta atual reúne processos, contatos, publicações, tarefas, agenda, financeiro, documentos, configurações e integrações em um frontend JavaScript modular. O arquivo `js/portal.js` funciona como composition shell sobre um único Store e o backend canônico.

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

Dê duplo clique em `iniciar-atrium.bat`. O starter valida o Node.js, ativa `pnpm@11.19.0`, instala pelo lockfile congelado quando necessário e abre `http://127.0.0.1:4173` após o servidor responder.

### Terminal

```bash
git clone https://github.com/ricarossetto/Atrium-Senda.git
cd Atrium-Senda
corepack enable
corepack prepare pnpm@11.19.0 --activate
pnpm install --frozen-lockfile
pnpm start
```

## Testes automatizados

A suíte canônica contém 55 suítes registradas em `tests/run-all.mjs`, incluindo segurança, concorrência do Store, recuperação do runtime, migrações de segredo, primeira persistência de instalação nova, QR TOTP sintético, contrato de sincronização, backup/restore, integrações judiciais, módulos frontend, E2E e Visual QA.

```bash
pnpm check
pnpm test
```

O CI usa Node 24, `pnpm@11.19.0` e `pnpm install --frozen-lockfile`. O fluxo A1 completo é validado no job Windows; testes locais em outros sistemas não substituem essa autoridade.

## Estado e limitações do Beta

- Estado técnico pretendido deste gate: **TECHNICAL BETA READY — PRE-UI-V2**, condicionado ao workflow canônico verde do HEAD publicado.
- O feedback permanece local; o mantenedor só o recebe se o usuário exportar ou compartilhar deliberadamente o registro.
- DJEN/DataJud e portais dependem de disponibilidade, credenciais e configuração do ambiente.
- Ações oficiais, ciência judicial, envio de e-mail e confirmação de prazo permanecem sob responsabilidade humana.
- A UI V2 dual-mode é etapa futura. A UI Clássica atual permanece a única interface deste ciclo.

Consulte também o [Guia do Testador Beta](docs/BETA_TESTER_GUIDE.md), o [checklist de readiness](docs/development/BETA_READINESS.md) e o [roadmap](docs/development/ROADMAP.md).

## Licença

Distribuído sob a licença MIT. Consulte [`LICENSE`](LICENSE).
