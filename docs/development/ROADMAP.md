# ATRIUM — ROADMAP DE DESENVOLVIMENTO (BETA HARDENING)

## NOW (Ciclo Atual em Execução)
- **[P1] Coletor Judicial Nativo & Monitoramento Contínuo**:
  - Refinar o feedback visual de sincronização judicial no portal quando o coletor estiver inativo ou em modo nuvem.
  - Testar importação autônoma de intimações e prazos em segundo plano.

## NEXT
- **[P2] Migração de Armazenamento para SQLite Estruturado com Migrations**:
  - Mapear schema SQLite relacional, migrations automáticas e importer seguro com verificação de integridade.
- **[P3] Assistente Jurídico Contextual & IA com Filtro de Privacidade**:
  - Refinar o assistente com resumos automáticos e análise preditiva de prazos fatais.

## LATER
- **[P3] Aplicativo Desktop Empacotado (Electron / PWA)**:
  - Instalador `.exe` de clique único para Windows sem necessidade de terminal ou Node.js pré-instalado.

## DONE
- [P0] Suíte de Testes Automatizada com 10 suítes (100% de aprovação).
- [P0] Deploy Render Nuvem com `JURISFLOW_CLOUD_MODE=true` e proteção de bootstrap.
- [P0] Diagnóstico do Sistema como Feature de Primeira Classe com status visual e exportação `.json`.
- [P0] Cópias de Segurança Criptografadas (`.atrium-backup`) e Restauração com Integridade HMAC-SHA256.
- [P1] Canal de Feedback Beta Integrado diretamente na interface.
- [P1] Aplicação da Identidade Visual Atrium (vetores oficiais SVG e Brand Book).
- [P1] Correções de Contraste, Botão de Tema e Sidebar Collapsible.
