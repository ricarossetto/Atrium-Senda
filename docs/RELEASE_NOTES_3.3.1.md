# ATRIUM Senda 3.3.1 — 24/11/2026

## Destaques da versão 3.3.1

- **Tarefas sem resultados ficam mais fáceis de entender.** A lista diferencia o primeiro uso, a ausência de resultados por filtro e as tarefas concluídas. O estado vazio explica o que aconteceu e oferece a próxima ação.
- **Publicações preservam as edições feitas na tela.** A identificação dos controles ignora atributos genéricos inseridos por extensões do navegador e usa apenas os atributos oficiais do ATRIUM, evitando perder alterações ao atualizar a publicação.
- **Ações acessíveis e movimento contido.** O estado vazio funciona por teclado, anuncia mudanças a leitores de tela e respeita a preferência por movimento reduzido. O layout foi preparado para telas estreitas nos temas claro e escuro.
- **Instalação manual no Windows corrigida.** O instalador agora reconhece o nome oficial do pacote, `atrium-senda`, e não interrompe mais a instalação por causa dessa validação.
- **Pacote Arch com verificação correta.** O `PKGBUILD` publicado é gerado pelo workflow com os hashes SHA-256 dos arquivos da versão 3.3.1. O modelo no repositório não aceita instalação direta sem hashes reais.
- **Cache atualizado para 3.3.1.** A cadeia de entrada e os arquivos alterados usam a nova versão, para evitar que o navegador continue exibindo a versão anterior.

## Atualização

1. Faça backup dos dados do escritório.
2. Baixe os instaladores da versão 3.3.1 na [página de releases](https://github.com/ricarossetto/Atrium-Senda/releases/tag/v3.3.1).
3. Confira as somas SHA-256 em `SHA256SUMS.txt` antes de executar o instalador.
