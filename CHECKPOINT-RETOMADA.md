# ATRIUM — checkpoint de retomada, 09/09/2026

## Pedido atual e prioridade

O usuário pediu preservar o estado antes de acabar a cota e conferir se a revisão foi feita no projeto correto. Não reaplicar comentários históricos sem reproduzir o problema no checkout atual e comparar com main: podem se referir a outro projeto do Antigravity. Problemas já resolvidos em main devem ser desconsiderados.

## Identidade verificada

- Repositório: https://github.com/ricarossetto/Atrium-Senda.git
- Pasta: C:\Users\Ricardo PC\.codex\.chatgpt-projects\g-p-6a82f704d32881919c2abfb7ef8f806a\juris-flow
- Branch: v2.1-dev.
- HEAD funcional preservado: f497a25056faa13f3460da653991c936df8ccefb.
- origin/main após fetch: 33031f7 (fix: align onboarding logo and select arrow).
- O HEAD funcional está 8 commits à frente de origin/main e 0 atrás; todos os commits de main estão incorporados.
- Porta 4173: HTTP 200, PID 7608 no momento da auditoria. Os bytes de index.html, js/features/processes.js, js/components/onboarding.js e js/auth.js servidos por HTTP são idênticos aos arquivos deste checkout, comparados por SHA-256.
- Porta 4188: reservada ao Antigravity; não usar, parar ou alterar. PID observado 30228.
- Não foi necessária nova porta: a 4173 está servindo o projeto correto agora. Não há prova retrospectiva de qual projeto ocupava essa porta em cada comentário antigo. Uma aba aberta pode precisar ser recarregada para carregar os arquivos atuais.

## Lote funcional preservado acima de main

- 71507a9: filtros de tarefas contidos no painel.
- 33b9ed3: UF da OAB monitorada deve ser escolhida explicitamente.
- 44e89fd: triagem de publicações limitada a dois dias.
- 5f4753e: importação da carteira autenticada antes da sincronização.
- 25d31e3: acesso por chave e ações de processo mais claros.
- a16c0eb: correção de overflow em abas de autenticação.
- 2fa5ad4: introdução ao monitoramento com OAB/UF e primeira sincronização.
- f497a25: validação de chave solicita POST /v1/processes/collect com forceLive; guarda chave no cofre após sucesso e solicita incorporação dos dados; mensagens sem jargão snapshot.

## Verificação e limites

Na execução anterior passaram tests/tjrs_sidecar_integration.mjs, tests/decision_html_and_access_key.mjs, tests/ui_v2_processes.mjs, pnpm check e git diff --check. São testes sintéticos; não comprovam consulta real bem-sucedida com a chave do usuário. O coletor respondeu health ok/database connected. Seu código fica em C:\projetos IA\consulta tjrs atrium; é uma dependência separada, não confundir com o frontend servido em 4173.

Nenhuma consulta com chave real foi feita nesta auditoria. Não declarar resolução de CAPTCHA nem validação real de chave com base nos mocks. GitHub Actions não foi aguardado por instrução explícita do usuário. Não promover main automaticamente.

## Retomar com outra conta

1. Abrir esta pasta e ler este arquivo e AGENTS.md. Conferir git status e git log antes de editar.
2. Manter servidor 4173 ativo; conferir identidade por conteúdo HTTP antes de tratar novos comentários. Não tocar 4188.
3. Pedir ao usuário recarregar a aba antes da próxima revisão. Reproduzir erros no código atual, comparar main e só então corrigir.
4. Preservar data/, .env e cofre locais. Não publicar dados privados ou copiá-los para fixtures. O checkpoint Git contém código e documentação, não backup da base privada.
5. O usuário não quer aguardar verificações do GitHub sem pedido direto. Fazer testes locais proporcionais, sem ciclos repetitivos desnecessários.

Esta auditoria não alterou código funcional, não resetou dados, não trocou branch e não reiniciou servidores.

## Retomada do lote interrompido — 09/09/2026

Use o texto abaixo como primeira mensagem em outra instância do Codex:

> Continue o ATRIUM no repositório `C:\Users\Ricardo PC\.codex\.chatgpt-projects\g-p-6a82f704d32881919c2abfb7ef8f806a\juris-flow`, partindo do checkpoint remoto `fec343b` em `v2.1-dev`. Leia `AGENTS.md` e `CHECKPOINT-RETOMADA.md`, confira `git status` e não descarte alterações locais. O lote implementado separa o primeiro acesso em duas telas, inicia Publicações em "Não tratadas", preserva a janela de dois dias, elimina fontes repetidas, corrige o rodapé do inspetor e esclarece a exportação JSON. Os testes dirigidos e visuais já passaram. Não execute nem acompanhe `pnpm test` por iniciativa própria: o usuário rodará a suíte completa e enviará o resultado. Depois de receber `EXIT_CODE=0`, promova o commit validado para `main`, conforme a autorização já dada. Preserve `data/`, `.env`, cofres e a porta 4188. Mantenha o servidor do ATRIUM na porta 4173.

Estado no momento deste registro:

- branch `v2.1-dev`, HEAD base `1673fe4`;
- servidor ATRIUM em `127.0.0.1:4173`, PID 9016;
- `pnpm check` passou;
- testes dirigidos aprovados: `security`, `collector`, `legal_timeline`, `publications_feature`, `processes_feature`, `ui_v2_auth_shell` (154/154), `ui_v2_processes`, `ui_v2_publications`, acessibilidade de Processos/Publicações e Visual QA de Processos (235/235);
- a suíte completa foi interrompida a pedido do usuário para economizar créditos;
- falhas observadas antes da interrupção: testes legados de setup procuram OAB ainda na primeira tela (`configuration_persistence`, `frontend_module_boot`, `store_module`); navegação/dashboard/e-mail precisam selecionar o filtro adequado após o novo default `untreated`; `visual_human_acceptance` ainda espera altura antiga de 46 px, enquanto o layout atual aprovado mede 42 px; `document_storage` apresentou um timeout isolado e deve ser repetido sozinho antes de qualquer alteração.

Quando o for necessária validação completa, peça ao usuário para executar no PowerShell da raiz do projeto:

```powershell
pnpm test 2>&1 | Tee-Object -FilePath artifacts\full-validation.log
$atriumTestExit = $LASTEXITCODE
Get-Content artifacts\full-validation.log -Tail 120
Write-Output "EXIT_CODE=$atriumTestExit"
```

O usuário enviará as últimas linhas e o `EXIT_CODE`; o agente não deve manter uma sessão aberta apenas para observar a suíte longa.
