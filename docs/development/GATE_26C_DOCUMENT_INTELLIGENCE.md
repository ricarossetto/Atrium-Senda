# Gate 26C — OCR, preview e pipeline PDF

## Decisão operacional

O ATRIUM não incorpora OCR cloud nem baixa modelos durante o uso. Texto UTF-8 é extraído pelo próprio servidor de forma determinística. Imagens usam Tesseract local e PDFs usam Poppler para rasterização seguido de Tesseract, sempre após ação explícita do usuário.

Não foi adicionada dependência JavaScript pesada: os motores locais são opcionais e ficam sob controle do operador. Se ausentes, o endpoint retorna indisponibilidade clara e o original continua íntegro e baixável.

## Configuração local opcional

- `ATRIUM_TESSERACT_PATH`: caminho absoluto do executável Tesseract, ou `tesseract` disponível no `PATH`.
- `ATRIUM_PDFTOPPM_PATH`: caminho absoluto do `pdftoppm`/Poppler, ou `pdftoppm` disponível no `PATH`.
- `ATRIUM_OCR_LANGUAGES`: identificadores locais do Tesseract, por padrão `por`.

Os comandos usam execução direta sem shell, argumentos separados, timeout, buffer limitado e diretório temporário privado removido em `finally`. Nenhum arquivo é enviado a serviço externo.

## Matriz suportada

| Operação | Formatos | Comportamento |
| --- | --- | --- |
| Preview | texto UTF-8 e Markdown inerte | resposta `text/plain`, `nosniff` e CSP sandbox |
| Preview | PNG, JPEG e WebP por magic bytes | imagem same-origin, sem SVG/HTML |
| Preview | PDF | primeira página rasterizada localmente pelo Poppler |
| Extração | texto UTF-8 e Markdown inerte | extrator determinístico nativo |
| OCR | PNG, JPEG, WebP, BMP e TIFF | Tesseract local |
| OCR | PDF | até 25 páginas rasterizadas pelo Poppler e lidas pelo Tesseract |
| PDF derivado | texto UTF-8 e Markdown inerte | novo PDF determinístico; original não é substituído |

HTML, SVG, formatos Office e binários arbitrários não recebem preview/OCR. O sistema não promete conversão universal.

## Rastreabilidade e privacidade

O texto OCR é armazenado como blob AES-256-GCM separado. `state.documents` guarda somente metadata: documento-fonte, checksums, data, motor/versão, idioma, páginas, contagem de caracteres e marca de supervisão. Auditoria registra a operação, nunca o conteúdo extraído.

Conversão PDF cria um novo documento do mesmo proprietário com `sourceDocumentId` e metadata de derivação. O binário e o registro originais permanecem inalterados.

## Limites

- upload original: até 20 MB, conforme Gate 26B;
- OCR PDF: até 25 páginas;
- extração: até 1.000.000 de caracteres;
- renderização temporária: 25 MB por página e 150 MB no total;
- execução local: timeout explícito, sem retry automático.

Todo resultado OCR exige revisão humana antes de uso jurídico. O pipeline não classifica documentos, não cria prazos e não toma decisões processuais.
