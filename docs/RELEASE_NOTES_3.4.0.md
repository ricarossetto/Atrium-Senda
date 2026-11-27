# ATRIUM Senda 3.4.0 — 27/11/2026

## Destaques da versão 3.4.0

- **Navegação lateral e móvel refinadas.** Grupos recolhíveis reorganizados em Dia a dia e Escritório, acessos a Modelos de Prompt e Links Úteis reposicionados no Assistente e no menu utilitário, painéis expansíveis e barra móvel com recolhimento por leitura ajustado para viewport e safe-area no iPhone.
- **Retorno tátil nativo no iOS/Android.** Suporte a Taptic Engine via switch nativo no Safari 26.5+, vibração controlada no Android, opção discreta em Configurações > Preferências deste aparelho e respeito estrito a `prefers-reduced-motion`.
- **Simulação e contrato de iPhone Safari 26.5+.** Nova suíte dedicada (`test:ios-ui`) valida todas as telas em modo toque móvel, alvos mínimos de 44px, barra inferior, sobreposição e temas claro e escuro.
- **Correções no cliente e nos cálculos.** Preservação de campos eproc e `caseValue` numérico na edição de processos, concordância singular/plural uniforme na interface e nos relatórios, rótulos de horário na Agenda, certificado DJEN nas Publicações e validação mais estrita de importação de planilhas.
- **Hardening de backend, concorrência e privacidade.** Trava reentrante para mutações de estado, execução única no Domicílio Eletrônico, validação de links externos com fixação de DNS contra SSRF, resolução de symlinks em estáticos, exclusão/perfil com reautenticação, limpeza de cookies de sessão no logout e proteção de escopo privado na busca e nos comandos assíncronos.
- **Integrações judiciais atualizadas.** Login por certificado no eproc 9.24 (TRF4/JFRS), janelas de captura DJEN no fuso de São Paulo, remoção da consulta ao TJRS por chave (resposta `410`) e monitoramento legado do sidecar retirado com segurança.
- **Cache atualizado para 3.4.0.** Manifesto de ativos, cadeia de entrada, empacotamento desktop/Linux/macOS e documentação alinhados à nova versão.

## Atualização

1. Faça backup dos dados do escritório.
2. Baixe os instaladores da versão 3.4.0 na [página de releases](https://github.com/ricarossetto/Atrium-Senda/releases/tag/v3.4.0).
3. Confira as somas SHA-256 em `SHA256SUMS.txt` antes de executar o instalador.
