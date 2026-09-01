# ATRIUM — Managed Judicial Connectivity

## Escopo atual

O ATRIUM mantém uma camada local e supervisionada de conectividade judicial para leitura de acervo, movimentações e publicações. Ela reutiliza o cofre judicial cifrado, o `JudicialSessionManager`, os perfis persistentes do Chromium, os adapters de autenticação e o coletor existente.

O fluxo operacional é:

```text
identidade do escritório
→ estratégia explícita do portal
→ sessão isolada por usuário + identidade + portal
→ leitura permitida
→ ingestão canônica de processos/publicações
→ triagem humana
```

O certificado A1 armazenado significa apenas que a credencial está disponível no agente local. Isso não comprova que o PJeOffice esteja configurado, que o certificado esteja no Windows Store ou que qualquer portal esteja autenticado.

## Estratégias explícitas

- `public`: fonte oficial sem autenticação individual, atualmente DJEN e DataJud.
- `client-cert-mtls`: certificado cliente apresentado diretamente quando o portal e o runtime suportarem.
- `pjeoffice-local`: dependência separada do aplicativo oficial PJeOffice em loopback.
- `totp`: segundo fator isolado, sem pressupor usuário/senha.
- `username-password-plus-totp` / alias legado `credentials-totp`: credenciais do portal com segundo fator.
- `windows-store`: certificado disponibilizado pelo repositório do Windows; não é equivalente ao PFX cifrado.
- `interactive-human-required` / alias legado `manual-persistent-session`: autenticação acompanhada quando o portal exige CAPTCHA, QR, consentimento ou outra intervenção.

Segredos ficam no envelope AES-256-GCM local. Status e auditoria expõem apenas metadados higienizados.

## Estado por portal

Cada portal possui estado real persistido, sem inferência visual: `not_configured`, `authenticating`, `connected`, `action_required`, `expired` ou `error`.

Também são preservados último intento, último sucesso, erro sanitizado, contagem de falhas, próxima atualização e ação humana necessária. `action_required` e `expired` interrompem novas tentativas até reconexão explícita. Erros transitórios usam backoff exponencial limitado. Sucessos seguem cadência conservadora mínima de trinta minutos.

O agendamento do Windows é uma autoridade explícita e opcional, instalado por `collector/install-scheduler.ps1`. Ele ignora instâncias simultâneas; o próprio coletor aplica cadência e backoff por portal.

## Capacidades verificadas

- criptografia do cofre judicial e isolamento lógico de credenciais por identidade;
- A1 Sandbox no job Windows, sem alegar equivalência com login em portal real;
- TOTP RFC 6238 e descarte de QR no frontend;
- perfis persistentes e locks de sessão;
- DJEN e DataJud por APIs públicas oficiais;
- guards read-only do adapter PJe;
- deduplicação por CNJ e referências externas estáveis;
- matching explicável que gera sugestões, sem anexar ambiguidades silenciosamente;
- ingestão no pipeline canônico existente;
- estados, cadência, backoff, pausa para ação humana e sanitização testados em adapter sintético determinístico.

## Portais não verificados

PJe, eproc, e-SAJ e demais portais autenticados só podem ser apresentados como `verified` quando houver evidência explícita registrada para aquela configuração. A presença de código genérico ou de um seletor não certifica suporte real. Sem evidência, a UI informa `experimental` ou `not_verified`.

O CI não usa credencial real e não acessa portal autenticado externo. A validação live, quando feita futuramente, deve ser registrada separadamente, limitada a autenticação, listagem e navegação read-only. CAPTCHA e segundo fator que exijam pessoa são sempre `action_required`; não há bypass.

## Limite read-only absoluto

São proibidos: ciência ou confirmação de intimação, assinatura, petição, protocolo, acknowledgment oficial e confirmação automática de prazo.

Publicação tratada no ATRIUM não equivale a ciência judicial. Datas trazidas pela fonte permanecem metadados de origem e nunca viram prazo fatal confirmado sem ação humana.

## Matching explicável

O matching usa implementação própria no stack ATRIUM. Uma sugestão contém `caseId`, `reason`, `source` e `confidence`.

- CNJ exato: confiança máxima;
- referência externa exata: confiança alta;
- partes + tribunal: sugestão intermediária.

Somente a deduplicação canônica por identidade estável pode consolidar registros automaticamente. Sinais ambíguos permanecem sugestões para revisão humana.

## Segurança e auditoria

Nunca registrar ou retornar senha, cookie, bearer token, segredo TOTP, código de seis dígitos, passphrase ou chave privada. Auditoria pode registrar portal, ator, categoria da operação, resultado, contagem, duração e erro higienizado.

Arquivos PFX permanecem privados no agente local. Nenhum endpoint permite exportar chave privada. O frontend recebe apenas estado público e metadata mascarada.
