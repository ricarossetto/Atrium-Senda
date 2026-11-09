# ATRIUM — Edição Aberta (Senda)

**Gestão jurídica soberana, local-first, para escritórios brasileiros.**

O **ATRIUM** reúne processos, publicações, contatos e CRM, tarefas (Kanban), agenda, financeiro, documentos com OCR local e integrações judiciais somente leitura (DJEN, DataJud e eproc/PJe nacional) em um único ambiente. É um projeto de código aberto (MIT): você instala, opera e audita tudo no seu computador, com os dados cifrados sob o seu controle.

Decisões jurídicas, confirmação de prazos e atos processuais continuam sob responsabilidade humana. O ATRIUM nunca dá ciência, não assina e não protocola nada em portais judiciais.

[![Licença](https://img.shields.io/badge/licença-MIT-blue)](LICENSE)
[![Versão](https://img.shields.io/badge/versão-3.0.0-9b7a3c)](docs/RELEASE_NOTES_3.0.0.md)
[![Node.js](https://img.shields.io/badge/Node.js-24+-3c873a)](#instalação)

---

## Instalação

### App desktop (Windows)

Baixe o instalador **`ATRIUM_Setup_3.0.0_x64.exe`** na [página de releases](https://github.com/ricarossetto/Atrium-Senda/releases) e execute. O aplicativo abre direto no seu computador: o servidor local inicia sozinho, o primeiro acesso cria o administrador do escritório, e as atualizações chegam pela própria aplicação. Nenhum dado sai da sua máquina sem que você peça.

Os instaladores oficiais são publicados com soma SHA-256 (`SHA256SUMS.txt`) no mesmo release.

### Instalação manual (qualquer sistema com Node 24+)

```bash
git clone https://github.com/ricarossetto/Atrium-Senda.git
cd Atrium-Senda
pnpm install --frozen-lockfile
pnpm exec playwright install chromium   # apenas se for usar coleta judicial A1
pnpm start
```

Abra `http://127.0.0.1:4173`. No Windows, o `ATRIUM.bat` automatiza as verificações e abre o navegador. O diagnóstico do instalador fica disponível com `ATRIUM.bat --doctor`.

## O que esta edição oferece

| Área | O que já está disponível |
| --- | --- |
| Dashboard | Visão operacional do escritório: indicadores, agenda, publicações e prioridades |
| Processos | Cadastro por CNJ, partes, classe, assuntos, movimentos e navegação cruzada |
| Publicações | Leitura integral, não lida/lida, triagem, tratamento e criação explícita de tarefa |
| Contatos e clientes | Cadastro único por papéis, vínculos manuais prioritários, deduplicação supervisionada |
| CRM e oportunidades | Atendimento, etapas, responsável, origem e associação a contato |
| Tarefas e Kanban | Fluxo visual, responsáveis, datas, apontamentos e vínculo com processo/publicação |
| Agenda | Compromissos, tarefas, prazos confirmados e calendário externo opcional |
| Documentos | Minutas, acervo privado, upload/download, preview seguro, OCR e busca full-text |
| Financeiro e cálculos | Honorários, despesas, reembolsos, RPV/alvarás, vínculos processuais, módulo de cálculos |
| Busca global | `Ctrl+K` / `Cmd+K` sobre entidades e conteúdo indexável |
| Auditoria | Registro de ações relevantes, filtros e exportação local |
| Integrações judiciais | DJEN, DataJud, eproc nacional e PJe nacional — somente leitura |
| Assistente | IA opcional (Google Gemini ou provedor compatível), com revisão profissional obrigatória |

O que **não** está nesta edição (e faz diferença na prática hospedada):

- Serviço hospedado com disponibilidade gerenciada (o ATRIUM em [atrium.adv.br](https://atrium.adv.br), operado pela mesma equipe).
- Assistência jurídica com a base de habilidades MinutaIA e o acervo de 2 mil+ habilidades jurídicas calibradas (disponível no produto hospedado).
- Suporte, backups gerenciados e evolução contínua assistida.

Esta edição continua funcionando 100% offline para leitura e gestão do escritório; a IA é opcional e depende de chave própria.

## Princípios

- **Local-first:** o diretório de dados local é o modo principal; ele pertence ao escritório.
- **Cifrado:** estado, backups e segredos judiciais usam proteção adequada a cada camada (AES-256-GCM, sessão HttpOnly/SameSite, CSRF e RBAC).
- **Supervisionado:** integrações e IA apoiam o trabalho; nada é decidido pelo software em nome do advogado.
- **Coleta judicial somente leitura:** autenticação, descoberta e consulta são permitidas; ciência, assinatura e protocolo nunca.
- **Zero telemetria para terceiros:** nenhum dado sai da instalação sem ação explícita.

## Primeiros passos

1. Crie o administrador do escritório com nome, e-mail, usuário e senha.
2. Informe OAB/UF se for advogado e escolha se deseja ativar o monitoramento automático.
3. Conclua a verificação em duas etapas quando solicitada e guarde os códigos de recuperação.
4. Cadastre um contato e um processo pelo número CNJ.
5. Abra **Publicações** → pesquise por cliente ou CNJ → crie uma tarefa vinculada.

Se algo não responder, execute `ATRIUM.bat --doctor` (Windows) ou `pnpm verify` no diretório do projeto.

## Dados, backups e segurança

- Os dados ficam em `data/` dentro da instalação, ou no diretório definido por `JURISFLOW_DATA_DIR`.
- No app desktop, ficam em `%APPDATA%\ATRIUM\data`; logs, em `%APPDATA%\ATRIUM\logs`.
- Backups `.atrium-backup` cifrados são exportáveis pela tela de administração; a restauração valida formato, checksum e migrações.
- A chave `AUTH_ENCRYPTION_KEY` é indispensável para recuperar estado e backups cifrados: guarde-a em local seguro e separado.
- `data/`, `.env` e perfis judiciais **não** fazem parte do repositório nem do instalador.

Leia [.github/SECURITY.md](.github/SECURITY.md) e as [fronteiras de segurança](specs/security-boundaries.md).

## Testes e CI

```bash
pnpm check          # verificação de sintaxe de todo o código
pnpm test           # suíte completa (Playwright + Node)
pnpm test:ci-fast   # núcleo rápido: segurança, contratos e store
```

Os workflows em `.github/workflows/` são manuais (`workflow_dispatch`); a validação oficial é local e focada no escopo alterado. Veja [AGENTS.md](AGENTS.md) para as regras de contribuição e [docs/testing/REGRESSION_MATRIX.md](docs/testing/REGRESSION_MATRIX.md) para a matriz de regressão.

## Contribuindo

Leia [docs/CONTRIBUTING.md](.github/CONTRIBUTING.md) ou os guardrails completos em [AGENTS.md](AGENTS.md). Em resumo:

- Fixtures sempre sintéticas; nunca dados de cliente, OAB ou CPF reais.
- Mudança funcional aprovada vem com teste no mesmo escopo.
- Toda PR passa por revisão humana antes de merge.
- Commits em português brasileiro, mensagens diretas.

## Limitações conhecidas

- DJEN, DataJud, BrasilAPI, ViaCEP e portais dependem de serviços externos e podem estar indisponíveis.
- A autenticação em portais pode exigir certificado A1, PJeOffice, TOTP ou ação humana.
- O ATRIUM não pratica atos judiciais e não substitui o profissional habilitado.

## Documentação

- [Instalação](docs/INSTALLATION.md) · [Primeiros 10 minutos](docs/QUICK_START.md) · [Manual do usuário](docs/USER_MANUAL.md)
- [Arquitetura](docs/ARCHITECTURE.md) · [Specs](specs/README.md) · [CHANGELOG](docs/CHANGELOG.md) · [Notas da 3.0.0](docs/RELEASE_NOTES_3.0.0.md)

## Licença

MIT — veja [LICENSE](LICENSE) e [NOTICE.md](NOTICE.md).
