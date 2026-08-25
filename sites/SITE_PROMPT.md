# Prompt para usar com @Sites / Codex

Use este prompt depois de abrir o repositório no ChatGPT desktop/Codex:

```text
@Sites Crie uma interface web para este projeto jurídico. Quero uma aplicação leve, profissional e sóbria, chamada “Keller Legal Agent”, com:

1. tela “Novo caso” para nome do caso, número do processo, tipo de peça, instruções e upload múltiplo de PDFs/imagens/documentos;
2. armazenamento persistente dos casos e metadados em D1 e dos arquivos em R2;
3. tela do caso com abas Documentos, Cronologia, Plano, Fontes, Minuta e Auditoria;
4. editor Markdown da minuta com autosave e histórico simples de versões;
5. painel visual de fontes D#/J#/L# e status verificado/pendente;
6. exportação da minuta em Markdown e texto;
7. acesso inicialmente restrito ao proprietário;
8. nenhum segredo ou OPENAI_API_KEY no código;
9. não implemente uma chamada fictícia a modelo. Se o runtime desta conta não puder disparar o agente Codex/Workspace Agent diretamente, deixe o botão “Executar agente” em modo claramente identificado como integração pendente, e documente o ponto de integração no código.

Use um layout responsivo, focado em desktop, com navegação lateral, tipografia legível e alta densidade de informação sem aparência de dashboard genérico. Prepare o projeto para implantação com ChatGPT Sites e confirme compatibilidade antes de publicar. Primeiro salve uma versão para revisão; não publique até eu pedir explicitamente.
```
