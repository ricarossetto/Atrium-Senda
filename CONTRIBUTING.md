# Como contribuir

Obrigado por contribuir com o ATRIUM. Mudanças devem preservar integridade de dados, privacidade, supervisão humana e as autoridades canônicas do produto.

## Ambiente

- Node.js 24 ou superior;
- Corepack;
- pnpm 11.19.0;
- instalação com `corepack pnpm install --frozen-lockfile`.

## Fluxo

1. Leia `AGENTS.md` e a especificação relevante em [`specs/`](specs/README.md).
2. Faça uma mudança pequena e coerente.
3. Use fixtures exclusivamente sintéticas.
4. Rode testes dirigidos ao domínio alterado.
5. Execute `corepack pnpm check` antes de enviar.
6. Descreva contrato, risco e evidência de validação no pull request.

## Fronteiras obrigatórias

- Um Store e uma fonte de verdade; não crie estado funcional paralelo.
- Preserve `revision`, 409 explícito, escrita atômica e recovery.
- Backend é autoridade de autenticação, permissão, segredos e persistência.
- Nunca adicione credenciais, `.env`, PFX, TOTP, dados reais ou screenshots privadas.
- Integrações judiciais permanecem somente de leitura e supervisionadas.
- Não confirme prazo por inferência nem transforme resultado externo em verdade automática.
- Provedores externos precisam de allowlist, timeout, limites, cache/proveniência e falha conservadora.

## Testes e visual QA

Prefira testes dirigidos durante o desenvolvimento. Se alterar UI, capture estados relevantes em temas e viewports adequados, inspecione as imagens diretamente e respeite `prefers-reduced-motion`. Não atualize snapshot/hash para esconder regressão.

O CI completo executa Lint/Test/E2E, Visual QA multiviewport e validação A1 no Windows.
