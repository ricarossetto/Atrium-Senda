# Notas de Lançamento — ATRIUM v2.4.0 (Cloud & Desktop)

**Data de Lançamento:** 10 de Setembro de 2026  
**Ambiente Oficial de Produção:** [https://atrium.adv.br](https://atrium.adv.br)  
**API Central & Backend:** [https://api.atrium.adv.br](https://api.atrium.adv.br)  
**Licença:** MIT — Open Source & Local-First  

---

## Destaques da Versão 2.4.0

A versão **2.4.0** introduz o redesenho e a calibração ergonômica completa do **Onboarding Show**, padronizando a geometria da janela modal, eliminando qualquer corte nos botões de navegação inferiores, alinhando com precisão milimétrica os crachás de opções do Certificado A1 e enriquecendo todas as etapas com cartões informativos e espaçamento visual luxuoso.

---

### 1. Onboarding Show Calibrado & Geometria Perfeita (Zero Cutoff)
- **Janela Modal Padronizada**: Dimensões normalizadas para `min(820px, calc(100vw - 32px))` e altura `min(670px, 92vh)`, garantindo estabilidade absoluta em telas de laptop e monitores de alta densidade.
- **Rodapé Fixo com Zero Corte**: Barra de navegação inferior com `height: 76px` e botões de `44px` perfeitamente centralizados verticalmente (16px de folga acima e abaixo), sem contato com as bordas arredondadas da janela.
- **Carrossel Horizontal Fluido**: Efeito visual de *slide* horizontal contínuo entre os 6 passos, com sincronização em tempo real do stepper superior e dos indicadores (*dots*).
- **Alinhamento Laser das Badges do A1**:
  - `RECOMENDADO` (Dourado Champagne / Ouro Nobre)
  - `OPCIONAL` (Slate / Cinza Neutro)
  - `ACESSO LIVRE` (Azul Mineral / Light Blue)
  - Todos os crachás possuem largura fixa de `120px`, altura de `28px` e margem direita milimetricamente alinhada na borda dos cartões.

---

### 2. Espaçamento Desafogado e Conteúdo Rico em Todas as Etapas
- **Slide 1 (Apresentação)**: Grade de recursos 2x2 com cartões de alta densidade (*Gestão Unificada*, *Inteligência IA*, *Cofre Local*, *Prazos & Financeiro*) e nota de parametrização.
- **Slide 2 (Advogado Titular)**: Enriquecido com cartão de *Identificação Automática em Peças* e nota de privacidade e sigilo OAB/LGPD.
- **Slide 3 (Identidade do Escritório)**: Cartão de *Papel Timbrado & Comunicação Institucional* e orientação para filiais.
- **Slide 4 (Atmosfera & Tema)**: Comparativo lado a lado ampliado (*Black & Gold* vs. *Pearl & Slate*), acompanhado de cartão sobre ergonomia visual em leitura de acórdãos e petições.
- **Slide 5 (Certificado Digital A1)**: Cartões de opção espaçados e guia transparente em 3 colunas explicando o funcionamento do arquivo `.pfx`, o cofre criptográfico AES-256 local e a autonomia do modo público.
- **Slide 6 (Ativação)**: Crachá virtual dinâmico, checklist de prontidão e recomendações de primeiros passos operacionais no Painel.

---

### 3. Dossiê de Auditoria Arquitetural Codex
- Disponibilização do prompt técnico mestre `docs/CODEX_AUDIT_PROMPT.md`, cobrindo os 6 pilares de governança, segurança e soberania do ATRIUM para auditorias contínuas no OpenAI Codex.

---

### 4. Conformidade e Qualidade Automatizada
- 100% de aprovação na suíte de testes de regressão visual (`tests/visual_ui_v2_onboarding.mjs` — 36/36 asserções em 4 resoluções).
- 100% de conformidade com alvos de toque acessíveis de 44x44px em resoluções móveis.
- Validação completa de sintaxe e tipos via `npm run check`.
- Validação end-to-end de autenticação e persistência via `tests/smoke.mjs`.
