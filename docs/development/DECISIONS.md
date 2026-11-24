# Decisões de arquitetura e produto

## Autoridade do estado

O backend é a autoridade de autenticação, autorização, concorrência e persistência. O Store oficial é a fonte única de verdade do frontend. A interface apresenta esse estado e não cria uma segunda cópia autoritativa.

A gravação usa revisão explícita e resposta `409` em conflito. O cliente não converte falha em sucesso nem descarta uma edição para fazer a tela parecer consistente.

## Interface

A Migração UI V2 concluída em modo dual foi uma fase de engenharia. O Planejamento histórico da UI V2 em modo dual permanece documentado para explicar a transição.

O estado atual oferece somente a interface V2 ao usuário. A arquitetura frontend foi modularizada por domínio, com features, componentes, presentadores e composition shell. Não existem duas árvores operacionais ativas.

## Persistência e backup

O estado oficial usa JSON cifrado com AES-256-GCM, gravação temporária e troca atômica. O backup `.atrium-backup` inclui verificação de integridade e snapshot pré-restauração.

SQLite permanece uma possibilidade futura de backend dedicado. A decisão atual não implementa SQLite como o padrão do Store oficial. Qualquer mudança de provider exige migração, backup e teste de restauração.

## Conectividade judicial

A Conectividade judicial gerenciada e estritamente read-only é a política vigente. DJEN, DataJud, eproc e PJe podem autenticar, consultar e ler; não podem praticar atos processuais.

Ciência, assinatura, petição, protocolo e confirmação de prazo são decisões humanas. O ATRIUM registra referências e tarefas, mas não pratica esses atos.

Quando um portal exige desafio humano, as falhas temporárias pausam retries e exigem reconexão humana. O sistema não contorna CAPTCHA, segundo fator ou bloqueio de origem.

## E-mail e notificações

O envio de publicação é manual e autorizado. O boletim em lote manual usa o mesmo transporte e as mesmas verificações de acesso. Não existe envio automático de publicação nem auto-send.

Falhas de entrega ficam explícitas. O sistema não afirma sucesso antes da confirmação do transporte.

## Dados sintéticos e evidência

Testes, fixtures, capturas e documentação usam somente dados sintéticos. Evidência não pode conter senha, token, cookie, certificado, chave privada ou dado real de cliente.

Uma captura de tela não substitui a leitura da imagem, a verificação geométrica nem a reprodução do fluxo.

## Evolução

Toda mudança funcional atualiza a spec e o teste de contrato correspondentes. Mudanças de interface preservam Store, API, revisão, auditoria e feedback de persistência.

Capacidades futuras entram por subgate próprio. O roadmap não é autorização para ampliar escopo, mudar provedor ou criar automação com efeito externo.
