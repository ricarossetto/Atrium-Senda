# ATRIUM — Inteligência cadastral brasileira

Status: **CURRENT**

## Escopo atual

O ATRIUM oferece consulta cadastral supervisionada para apoiar o preenchimento de Contatos. O backend é a única fronteira de rede e aceita apenas fontes públicas expressamente permitidas. Nenhum resultado altera o Store por conta própria.

- CPF: normalização, formatação e validação estrutural local. **Consulta externa de CPF não configurada**; a validação não confirma identidade nem situação cadastral.
- CNPJ: CNPJ numérico legado e CNPJ alfanumérico conforme o cálculo oficial da Receita Federal; consulta pública pela BrasilAPI.
- CEP: BrasilAPI como fonte primária e ViaCEP como fallback.
- Bancos: diretório público da BrasilAPI, pesquisável por código, ISPB ou nome.

## Revisão humana e autoridade

O contato canônico permanece autoridade. Uma consulta apresenta o cadastro atual lado a lado com os dados encontrados. Cada campo precisa ser selecionado explicitamente e o formulário ainda precisa ser salvo pelo usuário. São preservados:

- precedência dos dados locais já curados;
- ausência de merge automático;
- ausência de criação automática de cliente;
- proveniência por fonte, freshness, instante da consulta e campos aplicados;
- auditoria minimizada, sem CPF, CNPJ, endereço, telefone ou e-mail no detalhe.

Sócios do QSA podem ser preparados individualmente e só são criados após o salvamento do formulário. O papel é `outro`, nunca `cliente`. Relações processuais e identidades semelhantes são apenas indícios apresentados para revisão.

## Duplicidade supervisionada

- Nível A: CPF/CNPJ ou identificador externo idêntico.
- Nível B: nome compatível com metadado corroborante forte, como canal de contato ou localidade.
- Nível C: semelhança nominal ou presença nominal em relação processual; exige revisão humana.

Nenhum nível autoriza merge silencioso, descarte de dado local ou conclusão jurídica de identidade/conflito.

## Segurança e resiliência

As rotas `/api/registry/*` exigem sessão autenticada e são somente GET. O serviço aplica allowlist de origem, bloqueia URL arbitrária, usa timeout, retry limitado, circuit breaker, cache TTL e limite por janela. Erros externos são saneados antes de chegar ao navegador.

A configuração exibe prioridade, capacidades, TTL, última resposta bem-sucedida e latência conhecida. “Testar conexão” é uma ação humana explícita e limitada a provedores conhecidos.

## Fontes e clean-room

O cálculo de CNPJ alfanumérico foi implementado a partir da documentação pública da Receita Federal (mapeamento ASCII menos 48, pesos oficiais e módulo 11). A integração usa APIs públicas pelos seus contratos HTTP. Nenhum código, tradução de implementação, ícone ou asset AGPL foi incorporado.

## Limites futuros

Consulta externa de CPF, novos provedores de pessoas, enriquecimento automático e merge probabilístico permanecem fora do produto atual. Qualquer expansão exige fonte lícita, minimização de dados, threat model, contrato de retenção e novo gate explícito.

## Autoridade executável

- `lib/registry/identifiers.mjs`
- `lib/registry/registry-service.mjs`
- `lib/http/registry-routes.mjs`
- `js/features/contacts.js`
- `js/features/configuration.js`
- `tests/registry_intelligence.mjs`
- `tests/ui_v2_registry_intelligence.mjs`
