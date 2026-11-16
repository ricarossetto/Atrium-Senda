# ATRIUM Senda 3.1.4 — 15/11/2026

> 💡 **Quer o sistema jurídico completo na nuvem (Financeiro com Asaas, Cálculos, Documentos com OCR, Equipe Ilimitada e Robô Atrium IA)?**
> O **ATRIUM Senda** entrega apenas o **escopo Básico** para 1 computador local. Teste gratuitamente por **14 dias (sem cartão)** o **[ATRIUM Pro e ATRIUM Pro IA na nuvem](https://atrium.adv.br/discover/?utm_source=github-release-3.1.4)** ou veja o comparativo completo em **[senda.atrium.adv.br/discover](https://senda.atrium.adv.br/discover/)**.

---

## O que muda na 3.1.4

- **Foco estrito no Escopo Básico Local (`basic`):** O ATRIUM Senda passa a operar nativamente no escopo do plano Básico (*Dashboard, Processos, Publicações, Tarefas/Kanban, Agenda, Contatos, Integrações Judiciais somente leitura, Auditoria e Configurações/Backup*).
- **Módulos de escala exclusivos do ATRIUM Pro e Pro IA na nuvem:** Recursos avançados de escritório — **Financeiro Jurídico com cobranças Asaas (Pix/Boleto), Cálculos Cíveis/Trabalhistas/Previdenciários (CNIS), Acervo de Documentos com OCR e busca full-text, Assistente de Redação e o robô Atrium IA (2.069 habilidades jurídicas)** — permanecem exclusivos da plataforma oficial em [atrium.adv.br](https://atrium.adv.br/discover/).
- **Nova página oficial do ATRIUM Senda:** Publicada em [https://senda.atrium.adv.br/discover/](https://senda.atrium.adv.br/discover/), reunindo os instaladores multiplataforma, o comparativo detalhado entre as edições e o passo a passo de migração em 1 minuto via arquivo `.atrium-backup`.
- **Atalho de migração e upgrade em Configurações:** A tela de Configurações e a tela de acesso exibem o convite direto para degustação de 14 dias do ATRIUM Pro na nuvem, sem perda de dados.
- **Licença atualizada para FSL-1.1 (Uso Local Não-Concorrente):** O uso local gratuito pelo próprio advogado ou escritório segue liberado, ficando expressamente proibida a exploração comercial concorrente (SaaS, hospedagem para terceiros, multi-tenant ou white-label).

## Instalação (ATRIUM Senda 3.1.4 Basic Local)

Baixe o pacote da sua plataforma na [página oficial do Senda](https://senda.atrium.adv.br/discover/#instaladores) ou nos ativos desta release e confira o `SHA256SUMS.txt`.

Para atualizar uma instalação manual existente:

```bash
git pull
pnpm install --frozen-lockfile
pnpm start
```

## Verificação

- `node scripts/check-syntax.mjs` — sintaxe de todos os módulos JS/MJS validada.
- `node scripts/asset-version-manifest.mjs` — todas as referências versionadas em `?v=3.1.4` verificadas.
- `node tests/stable_release_contract.mjs`, `node tests/toolchain_contract.mjs`, `node tests/windows_installer_checksum.test.mjs`, `node tests/ui_v2_basic_density.mjs`, `node tests/open_source_features.mjs` e `node tests/spec_contracts.mjs` — aprovados.
