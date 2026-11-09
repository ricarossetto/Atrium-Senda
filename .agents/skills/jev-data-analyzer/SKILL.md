# Análise operacional com Atrium IA

Descrição: Use quando o usuário pedir análise operacional de publicações pendentes, priorização de tarefas, produtividade da equipe, riscos processuais registrados ou plano de ação do escritório. A Atrium IA explica evidências, pesos, denominadores e limitações dos dados, com propostas para revisão humana e consulta manual opcional de contagens globais minimizadas, sem treinamento.

## Quando usar

1. "Analisar publicações pendentes do escritório": distinguir backlog integral de detalhes na janela e conferir vínculos com tarefas.
2. "Priorizar tarefas pela urgência operacional": explicar a pontuação a partir de datas, prioridade e responsável já registrados.
3. "Analisar produtividade da equipe e distribuição da carga": comparar conclusões, duração, pontos e carga aberta, sem avaliar qualidade ou capacidade individual.
4. "Conferir riscos processuais registrados": revisar marcações fatais existentes, vínculos e andamentos com origem confiável, sem concluir prescrição.
5. "Preparar um plano de ação do escritório": organizar propostas de conferência, sem executar tarefas ou atos.

## Procedimento

- Trabalhe com a análise consolidada do escritório autenticado. Declare revisão fonte, instante da avaliação, fuso e janela. Não substitua dados ausentes por exemplos fictícios em uma análise real.
- Separe resultado determinístico local de consulta opcional ao modelo. Selecionar esta skill orienta a resposta do Assistente; não executa o painel de análise nem autoriza consulta externa por si só. Sem resultado disponível, declare a limitação e oriente a consulta manual.
- Use somente datas já registradas. A idade e a proximidade são diferenças de dias civis no fuso do escritório, normalmente America/Sao_Paulo. Não são contagem de prazo jurídico. Datas sem horário vencem ao fim do dia; instantes com fuso são comparados exatamente.
- Explique o score operacional como soma dos componentes: atraso registrado 40; data não vencida em até 7 dias 20; marcação fatal explícita 30; prioridade urgente 20 ou importante 10; ausência de responsável 5. Desempate por data crescente e ID. Pontuação não é probabilidade de perda, mérito ou urgência jurídica definitiva.
- Preserve o backlog integral de tarefas abertas e publicações não tratadas ou em análise. Os detalhes de publicações e as conclusões de produtividade dependem da janela de até 90 dias. Uma página vazia não prova acervo vazio.
- Mostre numerador e denominador das taxas. Pontualidade considera conclusões com data operacional válida; duração considera conclusões com criação e conclusão avaliáveis. Base vazia significa não informado, não zero. Diferencie tempo decorrido de minutos apontados.
- Vincule cada achado aos IDs das evidências locais. Informe exclusões, datas inválidas ou futuras, referências ambíguas, cobertura parcial e registros fora da janela. Confiança não medida permanece não informada.
- Trate carga aberta, espera e atrasos como fatores observados, nunca como causas comprovadas. Sugestões de distribuição usam carga projetada e histórico registrado do mesmo tipo, são hipotéticas e exigem revisão humana. Não equivalem a atribuição ou autorização de acesso.
- Em riscos, confira se a tarefa está vinculada ao ato, não apenas ao processo. Prescrição permanece não avaliável sem campo oficial estruturado. Não extraia termo prescricional do texto, da idade do processo ou do último andamento.
- Entregue propostas com evidências, responsável apenas sugerido e data existente apenas como referência. Nenhuma proposta cria tarefa, altera prioridade, atribui responsável, confirma prazo ou marca publicação como tratada.

## Privacidade e consulta opcional

A análise operacional pode usar os dados reais do próprio escritório no servidor. Isso não autoriza seu uso como treinamento nem como massa de teste. Ensaios e demonstrações usam somente dados sintéticos.

A consulta externa é uma ação manual separada. O administrador escolhe o botão que declara o envio de contagens globais, com a auditoria da solicitação confirmada antes da consulta. O pedido de análise local ou a escolha da skill não autoriza esse envio.

- O servidor minimiza os dados antes da saída. Somente contagens globais permitidas podem chegar ao modelo; células menores que 5, inclusive zero, são suprimidas e aparecem como não informadas.
- Registros com sinais conservadores de sigilo/restrição e seus vínculos são excluídos. Vínculos ausentes ou ambíguos também impedem sua inclusão no agregado externo. Ausência de marca não comprova publicidade ou elimina risco de reidentificação.
- Nomes, números de processo, IDs de evidência, datas individuais, textos judiciais, relatório, CSV, credenciais e estado do navegador não são enviados nessa consulta. Não cole esses dados no chat para contornar a minimização.
- A consulta usa somente o adaptador nativo existente com credencial configurada no ambiente do servidor. Não prometa execução pelo provedor de chat, treinamento, configuração disponível ou validação com modelo real sem evidência.
- Falta de configuração, supressão, timeout, cancelamento ou resposta inválida mantém a análise local e deve ser declarada. Uma decisão consultiva escolhe somente um foco de conferência ou se abstém; não produz novas datas ou atos.
- Registre apenas metadados operacionais da solicitação e do desfecho na auditoria oficial, sem conteúdo, chaves, prompt ou resposta do modelo. Falha de auditoria impede anunciar confirmação; confira o estado antes de repetir.

## Entrega e revisão

Apresente o recorte, os achados com evidências, a regra quantitativa, as limitações e as propostas que dependem do profissional. Aplique os padrões de qualidade e revisão adversarial. Ciência judicial, assinatura, peticionamento, envio de e-mail e execução de propostas permanecem fora desta análise. Não afirme causa raiz, prescrição calculada, prazo inferido, modelo real validado ou sucesso de persistência sem prova.
