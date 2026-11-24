# Plano mestre de desenvolvimento

## Estado atual

A arquitetura frontend foi modularizada. O composition shell concentra navegação, topbar, busca global, tema e estados do sistema. Features continuam responsáveis pelas regras de domínio; presentadores cuidam somente da apresentação.

O produto mantém um único App, um único Store e um único backend. A interface V2 é a única interface oferecida ao usuário.

## Camadas

1. **Shell:** navegação, identidade visual, busca, tema e estados globais.
2. **Features:** operações oficiais de processos, publicações, tarefas, agenda, contatos e demais domínios.
3. **Presenters:** leitura de dados e callbacks para a view ativa.
4. **Store:** estado oficial do frontend, revisão, fila e reconciliação.
5. **API:** chamadas autenticadas e tratamento explícito de erros.
6. **Backend:** autoridade de acesso, CSRF, persistência, integrações e auditoria.

Nenhuma camada pode criar um Store paralelo, duplicar regra de persistência ou afirmar sucesso antes da confirmação do backend.

## Persistência

O estado oficial é gravado como JSON cifrado. A escrita usa arquivo temporário, validação e troca atômica. A revisão recebida do backend é preservada.

SQLite permanece uma possibilidade futura de backend dedicado. Não está implementado como o padrão atual. Uma mudança de provider exige decisão, migração, backup e teste de restauração.

## Judicial e supervisão humana

As integrações judiciais são somente leitura. Ciência, assinatura, petição, protocolo e confirmação de prazo permanecem fora da automação.

Falhas de origem, CAPTCHA, segundo fator ou sessão expirada exigem reconexão humana. O sistema não transforma bloqueio em resultado vazio nem pratica ato oficial.

## Qualidade e release

Toda alteração começa pela spec e pelos testes do domínio. A validação local registra comando, resultado e limitações.

Os gates de interface incluem:

- sintaxe e contratos de asset;
- suítes funcionais e de acessibilidade;
- estado vazio, foco, teclado e movimento reduzido;
- temas claro e escuro;
- viewports desktop e mobile;
- leitura de capturas e verificação de overflow;
- regressão dos fluxos vizinhos.

A release reúne versão, changelog, notas, instaladores e somas SHA-256. A publicação de um artefato não comprova a instalação em uma máquina do usuário.

## Próximas frentes

1. Validação humana dos instaladores.
2. Restauração de backup sintético em ambiente limpo.
3. Revisão documental e de acessibilidade.
4. Novos subgates somente com escopo, evidência e rollback definidos.

O plano mestre não autoriza automação de atos judiciais nem ampliação de acesso.
