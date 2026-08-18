# Hospedagem protegida da Central Keller

[Publicar uma prévia no Render](https://render.com/deploy?repo=https://github.com/ricarossetto/kanban-escritorio-v3)

O `render.yaml` mantém o serviço no plano gratuito, verifica a saúde pela rota
`/api/auth/status` e ativa novos deploys a cada atualização da branch principal.
Essa publicação é somente uma prévia: o disco gratuito é efêmero e não deve ser
usado como fonte definitiva de dados jurídicos.

## Arquitetura recomendada para começar sem mensalidade

A opção segura de custo inicial zero é híbrida:

1. **Painel web:** Cloudflare Pages Free para os arquivos estáticos; o plano Hobby da Vercel deve ficar apenas para testes pessoais porque não é destinado ao uso comercial do escritório.
2. **Banco e autenticação:** Supabase Free com a migração RLS já incluída em `supabase/migrations`.
3. **Coletor judicial:** permanece no computador Windows do escritório, onde estão o A1, o PJeOffice e as sessões dos tribunais.
4. **Fontes públicas:** DJEN e DataJud podem ser consultados por tarefa agendada sem usar o certificado.
5. **Envio de resultados:** o agente local envia somente processos, intimações, tarefas e estado das fontes ao banco; nunca envia PFX, senha, QR, segredo TOTP ou perfil do navegador.

```text
Tribunais + A1/PJeOffice
          ↓
Agente Windows do escritório
          ↓ somente dados jurídicos coletados
Supabase com RLS e MFA
          ↓
Painel web hospedado
```

## O que não deve ir para a nuvem gratuita

- arquivo `.pfx`/`.p12` e senha;
- imagens ou segredos dos QR Codes TOTP;
- pasta `collector/.profile`;
- `.env` e `.env.collector`;
- chave `service_role` no navegador;
- sessão autenticada do PJe/eproc/e-SAJ;
- execução do PJeOffice, que depende do aplicativo local e do armazenamento de certificados do Windows.

O `Dockerfile` agora possui `.dockerignore` específico para impedir que esses arquivos entrem na imagem. Em `KELLER_CLOUD_MODE`, as rotas de upload do certificado, início da conexão judicial e reset de sessões são recusadas pelo servidor.

## Limitações do custo zero

- Render Free suspende o serviço inativo e usa disco efêmero; a configuração atual serve apenas para demonstração, não como banco jurídico.
- Vercel executa funções temporárias e não oferece o ambiente Windows/PJeOffice necessário ao coletor.
- Supabase Free é suficiente para um piloto pequeno, mas não inclui backup automático; devem existir exportações periódicas fora da plataforma.
- serviços gratuitos não oferecem SLA adequado para controle exclusivo de prazos. O painel deve continuar exigindo conferência humana e outra fonte oficial de contingência.

## Próxima etapa antes de publicar

1. criar um projeto Supabase separado para o escritório;
2. ativar MFA no Supabase Auth;
3. aplicar a migração RLS;
4. criar o primeiro workspace e seu usuário proprietário;
5. configurar o painel para ler e escrever no Supabase;
6. configurar o agente local com uma credencial de ingestão limitada ao workspace;
7. executar backup lógico diário ou semanal;
8. somente então publicar o painel e apontar o domínio.

Até essa etapa ser concluída, Render e Vercel devem ser tratados como pré-visualização. A versão local continua sendo a fonte persistente e protegida.
