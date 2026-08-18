# Pesquisa de integração judicial

Os repositórios externos usados na pesquisa são clonados em `research/vendor/` e ficam fora do Git. Nenhum deles é executado com certificados, senhas, TOTP, cookies ou dados reais do escritório.

## Resultado da auditoria

- `chapirousIA/pje-mcp-server`: não é uma integração funcional. O código retorna processos e protocolos simulados, desabilita a validação TLS e monta comandos de sistema com entrada de configuração. Foi rejeitado.
- `MrSchrodingers/pje_headless`: demonstra o protocolo legado do PJeOffice, mas não possui licença no repositório auditado e expõe serviços de assinatura/bearer sem autenticação de transporte. O servidor local aceita origem refletida e destino HTTP(S) fornecido pela página, o que amplia o risco de assinatura indevida/SSRF. Foi rejeitado para uso em produção.
- `futuraguaira/djenmonitor`: confirma o endpoint público do Comunica PJe, mas falsifica cabeçalhos de IP e publica um proxy CORS aberto. A técnica foi rejeitada. O nosso conector consulta diretamente o endpoint oficial, com identificação honesta e limites.
- `rvsanches/skills-datajud-djen`: documentação MIT útil sobre paginação, variantes de OAB, cancelamentos e HTML hostil. As regras defensivas foram reimplementadas localmente e cobertas por testes.
- `AlissonLGoncalves/app-gestao-advocacia`: confirmou os padrões de processo separado para o agendador, consulta DataJud por alias e fila com recuperação de trabalhos interrompidos. A cópia auditada não contém um arquivo de licença; por isso nenhum trecho foi incorporado literalmente. O limite de 100 itens indicado pelo conector DJEN desse projeto também não foi adotado, pois a integração local já foi validada com o limite atual de 50.
- `matheusjulio25/relatorio-processos-fr`: demonstra perfil persistente do Chrome, clique no login por certificado e TOTP opcional. O repositório não declara licença e seus seletores são uma aproximação para TRF5/macOS, então apenas o padrão arquitetural foi reimplementado de forma independente, com origens exatas e bloqueio de ações processuais.

## Arquitetura adotada

- A1/PJe: PJeOffice Pro oficial já instalado no Windows, perfil persistente do navegador e adaptador DOM somente de leitura.
- DJEN: API pública oficial `comunicaapi.pje.jus.br`, sem certificado e sem proxy de terceiros.
- DataJud: enriquecimento dos números já conhecidos pela API Pública oficial, alias inferido do número CNJ, nova tentativa limitada e renovação da chave pública somente pela página oficial `datajud-wiki.cnj.jus.br`.
- Segundo fator: manual por padrão; preenchimento TOTP só existe como opção explícita, restrita às origens configuradas e desligada de fábrica.
- Ações com efeito processual (`Tomar ciência`, `Responder`, `Peticionar`, `Assinar`, `Protocolar`) são bloqueadas pelo coletor.
