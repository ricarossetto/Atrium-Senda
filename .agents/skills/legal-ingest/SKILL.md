---
name: legal-ingest
description: Extrai e organiza fatos, páginas, documentos e cronologia de autos judiciais brasileiros antes da análise jurídica. Use em processos, PDFs, scans, anexos e conjuntos documentais jurídicos.
---

# Ingestão jurídica rastreável

1. Inventarie os arquivos e identifique tipo, parte emissora, data e função processual.
2. Leia texto nativo antes de recorrer a OCR.
3. Para scan ou página visualmente complexa, use leitura visual/OCR e valide campos críticos.
4. Atribua IDs `D#` em ordem estável. Para documentos longos, mantenha página/intervalo no registro.
5. Extraia apenas fatos suportados. Diferencie claramente:
   - fato alegado por uma parte;
   - fato documentalmente comprovado;
   - conclusão jurídica;
   - inferência ainda não comprovada.
6. Construa cronologia com data, evento, fonte D# e relevância.
7. Preserve divergências: não reconcilie silenciosamente datas ou valores conflitantes.
8. Marque OCR incerto e confira visualmente antes de usar em ponto decisivo.
