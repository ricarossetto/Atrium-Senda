# ATRIUM — REGISTRO DE DECISÕES ARQUITETURAIS (DECISIONS.md)

## 2026-08-25: Suporte Dual Nuvem (Render) e Local Seguro (Zero Trust)
- **Decisão**: Configurar `render.yaml` com variáveis `JURISFLOW_CLOUD_MODE=true` e proteger a inicialização com `SETUP_BOOTSTRAP_TOKEN`.
- **Problema**: O deploy no plano gratuito do Render possui sistema de arquivos efêmero; o servidor precisava separar tarefas de nuvem de operações nativas Windows (certificados A1 e coletores locais).
- **Alternativas consideradas**: Serverless Vercel (descartado por falta de estado persistente) ou Docker local obrigatório.
- **Razão da escolha**: Permite que o escritório use o Atrium centralizado na nuvem com segurança enquanto mantém coletores de tribunal locais integrados via API segura com token de ingestão.
- **Consequências**: Operações nativas locais retornam 503 na nuvem com mensagem explicativa e orientação clara.

## 2026-08-25: Nova Identidade Visual Oficial & Tipografia
- **Decisão**: Adoção do logotipo clássico em frontão romano com colunas e circuitos tecnológicos integrados em Ouro Nobre (`#C5A880` / `#C8A24B`), Bege Marfim e Grafite, com tipografia *Playfair Display* e *Inter*.
- **Problema**: A identidade antiga continha inconsistências de contraste no tema claro e logotipo provisório.
- **Alternativas consideradas**: Manter design escuro unicamente.
- **Razão da escolha**: Estabelecer um design sóbrio, imponente e com suporte de alto contraste tanto em modo claro quanto escuro.
- **Consequências**: Experiência visual profissional e alinhada ao público jurídico.

## 2026-08-25: Estratégia de Transição para Armazenamento Estruturado (SQLite)
- **Decisão**: Manter o JSON cifrado atual como base estável do Beta e planejar schema SQLite progressivo com migrations e backup automático antes da substituição.
- **Problema**: Migrações abruptas sem validação podem causar perda de dados de escritórios em produção.
- **Alternativas consideradas**: Migração forçada imediata.
- **Razão da escolha**: Garantir que o Beta seja 100% resiliente com zero risco de corrupção.

## 2026-08-25: Diagnóstico de Primeira Classe, Backups Criptografados e Feedback Beta
- **Decisão**: Implementar endpoints dedicados `/api/system/diagnostic`, `/api/system/backup/create`, `/api/system/backup/restore` e `/api/system/feedback` integrados visualmente na interface de configurações.
- **Problema**: Advogados não técnicos precisam de visibilidade instantânea sobre a integridade do sistema, facilidade para gerar cópias de segurança sem lidar com arquivos de sistema e um canal de comunicação nativo para relatar observações.
- **Alternativas consideradas**: Depender de logs de terminal ou scripts CLI externos.
- **Razão da escolha**: Elimina qualquer dependência de terminal e empodera o usuário final com ferramentas de governança de dados e suporte com privacidade garantida.
- **Consequências**: Sistema 100% auditável e com facilidade de suporte técnico via exportação de relatórios anonimizados.
