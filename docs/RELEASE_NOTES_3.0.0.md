# ATRIUM Senda 3.0.0 — Release Notes

**Data:** 2026-11-09 · **Tag:** `v3.0.0` · **Licença:** MIT

## O que mudou

O ATRIUM Senda voltou a ter manutenção ativa e ganhou um aplicativo desktop. Esta release consolida a abertura do repositório com tudo que a base principal acumulou em correções, desempenho e segurança, e entrega o ATRIUM Senda como um software de verdade para Windows — instalador, atalho, atualização automática — sem inflar o código aberto com o produto hospedado.

## Destaques

### Aplicativo desktop para Windows (novo)

- Instalador **NSIS** e **MSI** com Node.js 24 empacotado. Sem dependências de terceiros além do WebView2 (presente no Windows 10/11).
- O ATRIUM inicia sozinho quando você abre o aplicativo: o servidor local sobe em `127.0.0.1:<porta dinâmica>` e a janela carrega a tela inicial sem você ver o terminal.
- Dados do escritório em `%APPDATA%\ATRIUM\data`; logs, em `%APPDATA%\ATRIUM\logs\server.log`. Nada é enviado a servidor algum.
- **Atualização automática** pela própria aplicação (uma vez por dia, silenciosa). As somas SHA-256 dos arquivos ficam no `SHA256SUMS.txt` deste release.
- O instalador não apaga seus dados ao desinstalar.

### Motor recomposto

- Publicações: triagem assistida, tratamento, criação explícita de tarefa, janela de captura DJEN de 60/2 dias e reconciliação de capturas pendentes.
- Integrações judiciais somente leitura: DJEN, DataJud, eproc nacional e PJe nacional com sessões supervisionadas.
- Documentos: acervo cifrado, upload/download, preview, OCR local e busca full-text.
- Módulo de cálculos, RBAC por escritório e auditoria permanecem integralmente disponíveis.
- Correções acumuladas da linha principal incluídas (interface, acessibilidade, segurança e resiliência).

### O que saiu desta edição (e por quê)

O ATRIUM é um produto único com duas edições. A edição aberta — esta — é o escritório completo para instalar e operar no seu computador. A edição hospedada (<https://atrium.adv.br>) é o mesmo motor com o serviço gerenciado pela mesma equipe. Para manter a edição aberta viável e transparente, saíram desta edição as partes que são, na prática, o negócio do serviço hospedado:

- **Planos Basic / Pro / Pro IA e cobrança** (incluindo a chave global de IA e os webhooks de pagamento);
- **Plano de administração da plataforma** (`/api/platform/*`): chaves globais do operador, telemetria de frota e suporte avançado;
- **E-mails de ciclo de vida e campanhas**;
- **Base de habilidades jurídicas calibrada** (o acervo calibrado do Assistente);
- **Página pública /discover e os aplicativos móveis**.

O Assistente de IA continua na edição aberta, com chave própria do escritório (Google Gemini ou provedor compatível). A base de habilidades calibrada está disponível exclusivamente no produto hospedado.

### Segurança e privacidade

- Importação única e consolidada da árvore atual: caminhos locais de desenvolvimento e nomes de pessoas saíram do repositório público.
- Removidos: configurações de infraestrutura interna, artefatos de operação, scripts de validação internos e links pessoais.
- A auditoria de privacidade (`pnpm audit:privacy`) continua no ritual de release.

## Como instalar ou atualizar

**Instalação nova:** baixe `ATRIUM_Setup_3.0.0_x64.exe` em [releases](https://github.com/ricarossetto/Atrium-Senda/releases), verifique o SHA-256 (`SHA256SUMS.txt`) e execute. O aplicativo guia o primeiro uso: administrador do escritório, verificação em duas etapas e, opcionalmente, monitoramento da OAB.

**Atualização a partir de 2.x:** exporte o backup cifrado (Configurações → Backup → Exportar), anote a `AUTH_ENCRYPTION_KEY` em local seguro, instale o 3.0.0 por cima e, no primeiro acesso, restaure o backup. O banco local é migrado automaticamente ao subir a nova versão.

## Verificação do instalador

```text
SHA256SUMS.txt publica as somas de:
  ATRIUM_Setup_3.0.0_x64.exe      (instalador NSIS, por usuário)
  ATRIUM_3.0.0_x64.msi            (instalador MSI, por usuário)
```

Sem certificado de assinatura de código nesta edição (decisão de custo); verifique sempre a soma SHA-256. O aplicativo verifica e aplica as próprias atualizações com chave Ed25519.

## Limitações conhecidas

- Portais judiciais podem exigir certificado A1, PJeOffice, TOTP ou ação humana; a coleta é somente leitura.
- O Assistente sem chave de IA fica claramente não configurado; nada é enviado a terceiros sem a chave.
- O app desktop é Windows-only nesta versão; Linux/macOS continuam cobertos pela instalação manual com Node 24.
