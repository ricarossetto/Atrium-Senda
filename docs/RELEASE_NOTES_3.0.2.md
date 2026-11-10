# ATRIUM Senda 3.0.2 — Release Notes

**Data:** 2026-11-09 · **Tag:** `v3.0.2` · **Licença:** MIT

## O que esta versão corrige

O instalador 3.0.0/3.0.1 podia abrir uma janela sem interface (ou nem abrir): o pacote não levava as dependências de produção do servidor — os links do pnpm não sobrevivem ao empacotamento — e o processo morria com `ERR_MODULE_NOT_FOUND`. Além disso, os segredos de runtime do aplicativo desktop não eram injetados corretamente no processo Node.

## O que mudou

- **Staging das dependências**: agora instala com `node-linker=hoisted` — pastas reais, sem junctions — e o mapa de recursos do Tauri preserva a estrutura de pastas. O servidor inicia de verdade no executável.
- **Segredos do desktop**: gerados no primeiro boot com o gerador criptográfico do Windows (BCryptGenRandom), persistidos em `%APPDATA%\ATRIUM\.env` (sobrevive a atualizações) e injetados no processo do servidor. `AUTH_ENCRYPTION_KEY` com formato inválido é regenerada na inicialização.
- **Corte da edição aberta (3.0.x)**: cadências de varredura agendadas, camada analítica do Atrium IA, boletins operacionais e convites por e-mail/link saem desta edição (coleta judicial é manual; membros são cadastrados pelo administrador com aprovação). Pacotes de prompts de terceiros saíram do catálogo (12 skills integradas).
- **Aviso discreto na tela de login** para o serviço hospedado do ATRIUM (atrium.adv.br).

## Instalação

1. Baixe `ATRIUM_Setup_3.0.2_x64.exe` em [releases](https://github.com/ricarossetto/Atrium-Senda/releases) e confira a soma SHA-256 (`SHA256SUMS.txt`).
2. Execute: a instalação é por usuário, sem administrador (35,6 MB).
3. O servidor local sobe sozinho; o primeiro cadastro cria o administrador do escritório.
4. Em caso de atualização a partir de 3.0.0/3.0.1, os dados em `%APPDATA%\ATRIUM\data` são preservados.

## Arquivos publicados

```text
ATRIUM_Setup_3.0.2_x64.exe       (instalador NSIS, por usuário)
ATRIUM_Setup_3.0.2_x64.exe.sig   (assinatura do mecanismo de atualização)
latest.json                      (manifesto do atualizador)
SHA256SUMS.txt                   (soma do instalador)
```

## Limitações conhecidas

- O MSI continua habilitado somente pelo CI (WiX local tem bug de localização de idioma nesta máquina); o NSIS é o canal oficial desta edição.
- Varreduras agendadas (DJEN/eproc/PJe) continuam fora da edição aberta por decisão de escopo — use o botão manual ou o `ATRIUM.bat`.

## O que permanece

- Gestão completa (processos, publicações com triagem, tarefas/Kanban, CRM, financeiro e cálculos, documentos com OCR e busca, auditoria, backup local), integrações judiciais somente leitura e assistente de IA com chave própria do escritório.
