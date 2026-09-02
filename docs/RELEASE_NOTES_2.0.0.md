# ATRIUM 2.0.0 — Stable Release 1

ATRIUM 2.0.0 é a primeira versão estável do workspace jurídico local-first para escritórios brasileiros. A release consolida a interface V2, a persistência cifrada e os fluxos canônicos de trabalho supervisionado.

## Destaques

- Interface V2 Mineral Editorial, responsiva, clara/escura, acessível por teclado e compatível com redução de movimento.
- Operação local-first com estado AES-256-GCM, revisão otimista, gravação atômica, recovery e backups cifrados.
- Relações canônicas entre processos, contatos/clientes, publicações, tarefas, documentos, CRM e financeiro.
- Descoberta DJEN/DataJud conservadora, preservando dados-base e criando relações somente quando há suporte estruturado.
- Integrações A1, PJeOffice, TOTP e portais em modo supervisionado e somente de leitura.
- Acervo documental privado com upload/download, preview seguro, lixeira, checksum, OCR local opcional e busca full-text.
- Inteligência cadastral para CNPJ, CEP e bancos, com validação local de CPF e revisão seletiva de dados encontrados.
- Assistente Gemini opcional, biblioteca de prompts, contexto minimizado e revisão profissional obrigatória.
- Instalação Windows por duplo clique em `ATRIUM.bat`.

## Instalação

1. Baixe **Source code (zip)** desta release.
2. Extraia todo o conteúdo.
3. Dê duplo clique em `ATRIUM.bat`.
4. Conclua o primeiro administrador no navegador.

Node.js 24+ é obrigatório. Quando Node não existe e o Windows Package Manager está disponível, o launcher oferece o pacote oficial `OpenJS.NodeJS.LTS`. Dependências são instaladas com pnpm 11.19.0 e lockfile congelado.

Instruções detalhadas: [docs/INSTALLATION.md](INSTALLATION.md).

## Atualização

Antes de atualizar:

- exporte um `.atrium-backup`;
- preserve `.env` e a chave de criptografia;
- copie o diretório configurado em `JURISFLOW_DATA_DIR`;
- pare o servidor;
- instale a nova versão em pasta separada ou faça fast-forward de um clone limpo.

Não copie `node_modules` e não substitua arquivos privados por exemplos. A versão 2.0.0 mantém as migrações canônicas existentes; nenhuma promessa genérica de migração sem risco é feita. Valide o backup e o diagnóstico no seu ambiente.

## Modelo de segurança

- Dados canônicos e backups são cifrados com AES-256-GCM.
- Estado usa revisão e gravação atômica.
- Sessões usam cookies HttpOnly/SameSite, CSRF e RBAC.
- TOTP, PFX, credenciais judiciais e chave Gemini ficam fora do Store frontend.
- Documentos permanecem em armazenamento privado e protegido pelo backend.
- O índice de busca é derivado e reconstruível.

Leia [SECURITY.md](../SECURITY.md) antes de publicar o serviço fora de localhost.

## Limitações conhecidas

- DJEN, DataJud, BrasilAPI, ViaCEP, Gemini, SMTP e portais dependem de serviços externos.
- Portais podem exigir login, certificado, PJeOffice, TOTP, CAPTCHA ou confirmação humana.
- Não há lookup externo de identidade por CPF configurado por padrão.
- O ATRIUM não dá ciência, assina, peticiona ou protocola.
- Prazo jurídico somente é confirmado por profissional responsável.
- OCR e dados externos exigem conferência; ausência de dado não é preenchida por inferência.

## Integridade da release

O código-fonte da tag inclui `ATRIUM.bat`, `README.md`, `package.json`, `pnpm-lock.yaml` e todo o runtime necessário. Não inclui `node_modules`, `.env`, diretórios de dados, certificados ou credenciais.

Consulte o [changelog](../CHANGELOG.md), o [manual do usuário](USER_MANUAL.md) e a [arquitetura](ARCHITECTURE.md).
