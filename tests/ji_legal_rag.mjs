import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { SecurityManager } from '../lib/security.mjs';
import { BetaStore } from '../lib/judicial-intelligence/core/beta-storage.mjs';
import { chunkDocument, chunkText, pagesFromExtractedText } from '../lib/judicial-intelligence/rag/chunker.mjs';
import { buildBm25Index, bm25Search, tokenize } from '../lib/judicial-intelligence/rag/bm25.mjs';
import { reciprocalRankFusion, cosineSimilarity, denseSearch } from '../lib/judicial-intelligence/rag/fusion.mjs';
import { rerankChunks } from '../lib/judicial-intelligence/rag/ranker.mjs';
import { assertFaithfulAnswer, buildEvidencePack, validateCitation, CITATION_STATUS } from '../lib/judicial-intelligence/rag/citation-validator.mjs';
import { buildGroundedAnswer } from '../lib/judicial-intelligence/rag/abstention.mjs';
import { createRetrievalIndex, hybridRetrieve } from '../lib/judicial-intelligence/rag/retrieval.mjs';
import { createLegalRagService } from '../lib/judicial-intelligence/rag/index.mjs';
import { createFakeEmbedder } from '../lib/judicial-intelligence/rag/embeddings.mjs';
import { extractDocumentText, findPdftotext } from '../lib/judicial-intelligence/document-intelligence/extraction.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — LEGAL RAG (RETRIEVAL HÍBRIDO, CITAÇÃO E ABSTENÇÃO)');
console.log('===============================================================\n');

const CNJ = '5001234-56.2023.8.21.0001';
const EMPTY_CNJ = '0000000-00.0000.0.00.0000';
const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'atrium-ji-rag-'));

try {
  console.log('[L1] Chunker com metadados de página, overlap e IDs determinísticos...');
  {
    const longParagraph = 'Linha de contexto jurídico sintético. '.repeat(1200);
    const chunks = chunkText(longParagraph, { maxChars: 400, overlapChars: 60 });
    assert.equal(chunks.length > 1, true);
    assert.equal(chunks.every(chunk => chunk.length <= 420), true);
    const document = chunkDocument({
      documentId: 'doc-a',
      cnj: CNJ,
      documentType: 'SENTENCA',
      source: 'FIXTURE',
      date: '2024-02-20',
      party: 'Autora Teste',
      pages: [
        { page: 1, text: 'Sentença que julga procedente o pedido e fixa o valor da causa em R$ 15.000,00.' },
        { page: 2, text: 'Dispositivo com condenação em custas e honorários de sucumbência.' }
      ]
    });
    assert.equal(document.length, 2);
    assert.equal(document[0].page, 1);
    assert.equal(document[1].page, 2);
    assert.equal(document[0].cnj, CNJ);
    assert.equal(document[0].documentType, 'SENTENCA');
    assert.equal(document[0].chunkId, chunkDocument({
      documentId: 'doc-a',
      pages: [{ page: 1, text: 'Sentença que julga procedente o pedido e fixa o valor da causa em R$ 15.000,00.' }]
    })[0].chunkId, 'IDs devem ser determinísticos por documento/página/índice.');
    const pages = pagesFromExtractedText('pagina um\f pagina dois\f pagina tres');
    assert.deepEqual(pages.map(page => page.page), [1, 2, 3]);
  }

  console.log('[L2] BM25: acento-insensível, stopwords e ranking...');
  {
    assert.deepEqual(tokenize('Ação de Execução Fiscal'), ['acao', 'execucao', 'fiscal']);
    const chunks = [
      { chunkId: 'c1', text: 'O valor da causa foi fixado em R$ 15.000,00 na sentença.' },
      { chunkId: 'c2', text: 'A perícia médica concluiu pela incapacidade parcial.' },
      { chunkId: 'c3', text: 'Petição inicial com pedido de indenização por danos morais.' }
    ];
    const index = buildBm25Index(chunks);
    assert.equal(index.N, 3);
    const ranking = bm25Search(index, 'qual o valor da causa?');
    assert.equal(ranking[0].chunkId, 'c1');
    const accentRanking = bm25Search(index, 'PERÍCIA MÉDICA');
    assert.equal(accentRanking[0].chunkId, 'c2');
    assert.equal(bm25Search(index, 'xilofone zebra').length, 0);
  }

  console.log('[L3] Fusão RRF, similaridade e busca densa...');
  {
    const fused = reciprocalRankFusion([
      [{ chunkId: 'a' }, { chunkId: 'b' }],
      [{ chunkId: 'b' }, { chunkId: 'c' }]
    ]);
    assert.equal(fused[0].chunkId, 'b', 'RRF premia quem aparece nas duas listas.');
    assert.equal(cosineSimilarity([1, 0], [1, 0]), 1);
    assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
    const dense = denseSearch([
      { chunkId: 'x', embedding: [1, 0, 0] },
      { chunkId: 'y', embedding: [0, 1, 0] }
    ], [0.9, 0.1, 0]);
    assert.equal(dense[0].chunkId, 'x');
  }

  console.log('[L4] Reranker por cobertura de termos...');
  {
    const reranked = rerankChunks('valor da causa e honorários', [
      { chunkId: 'irrelevante', score: 1, chunk: { chunkId: 'irrelevante', text: 'movimentação genérica de expediente' } },
      { chunkId: 'coberto', score: 0.5, chunk: { chunkId: 'coberto', text: 'valor da causa fixado com honorários de sucumbência' } }
    ], { limit: 2 });
    assert.equal(reranked[0].chunkId, 'coberto');
    assert.equal(reranked[0].rerankReasons.some(reason => reason.startsWith('coverage')), true);
  }

  console.log('[L5] Validação de citação: trecho, chunk inexistente e claim sem citação...');
  {
    const chunksById = new Map([['abc123', { chunkId: 'abc123', page: 2, text: 'O valor da causa foi fixado em R$ 15.000,00.' }]]);
    assert.equal(validateCitation({ claim: 'valor fixado', chunkId: 'abc123', quote: 'R$ 15.000,00', chunksById }).status, CITATION_STATUS.VALID);
    assert.equal(validateCitation({ claim: 'valor', chunkId: 'inexistente', chunksById }).status, CITATION_STATUS.UNKNOWN_CHUNK);
    assert.equal(validateCitation({ claim: 'valor', chunkId: 'abc123', quote: 'R$ 99.999,00', chunksById }).status, CITATION_STATUS.QUOTE_NOT_FOUND);
    assert.equal(validateCitation({ claim: '   ', chunkId: 'abc123', chunksById }).status, CITATION_STATUS.EMPTY_CLAIM);
    const faithful = assertFaithfulAnswer('O valor é de R$ 15.000,00 [chunk:abc123].', chunksById);
    assert.equal(faithful.ok, true);
    assert.equal(faithful.totalClaims, 1);
    const unfaithful = assertFaithfulAnswer('O valor é de R$ 15.000,00 [chunk:abc123].\nOutra afirmação sem fonte.', chunksById);
    assert.equal(unfaithful.ok, false);
    assert.equal(unfaithful.totalClaims, 2);
    assert.equal(unfaithful.uncitedClaims.length, 1);
    const invented = assertFaithfulAnswer('Fato inventado [chunk:naoexiste].', chunksById);
    assert.equal(invented.ok, false);
    assert.equal(invented.invalidCitations.length, 1);
    assert.equal(invented.invalidCitations[0].status, CITATION_STATUS.UNKNOWN_CHUNK);
    const evidence = buildEvidencePack([...(chunksById.values())]);
    assert.equal(evidence[0].snippet.includes('R$ 15.000,00'), true);
  }

  console.log('[L6] Resposta aterrada com abstenção explícita e citação inventada rejeitada...');
  {
    const abstained = buildGroundedAnswer({ question: 'Qual o valor?', evidence: [] });
    assert.equal(abstained.status, 'INSUFFICIENT_EVIDENCE');
    assert.deepEqual(abstained.reasons.includes('NO_EVIDENCE'), true);
    assert.equal(abstained.answer, undefined);

    const lowScore = buildGroundedAnswer({
      question: 'Qual o valor?',
      evidence: [{ chunkId: 'c1', text: 'Apenas um trecho.', score: 0.01 }]
    });
    assert.equal(lowScore.status, 'INSUFFICIENT_EVIDENCE');

    const grounded = buildGroundedAnswer({
      question: 'Qual o valor da causa?',
      evidence: [{ chunkId: 'c1', text: 'O valor da causa foi fixado em R$ 15.000,00.', score: 1.2 }]
    });
    assert.equal(grounded.status, 'OK');
    assert.equal(grounded.citations.length > 0, true);
    assert.equal(grounded.confidence >= 0.55, true);

    const fabricated = buildGroundedAnswer({
      question: 'Qual o valor da causa?',
      evidence: [{ chunkId: 'c1', text: 'O valor da causa foi fixado em R$ 15.000,00.', score: 1.2 }],
      generator: () => 'Resposta sem qualquer lastro documental.'
    });
    assert.equal(fabricated.status, 'INSUFFICIENT_EVIDENCE');
    assert.equal(fabricated.reasons.includes('UNVERIFIED_CITATION'), true);
  }

  console.log('[L7] Recuperação híbrida com embedder sintético...');
  {
    const chunks = [
      { chunkId: 'k1', text: 'Sentença condenou o réu ao pagamento de indenização por danos morais.' },
      { chunkId: 'k2', text: 'Laudo pericial atestou incapacidade laboral parcial.' },
      { chunkId: 'k3', text: 'Ata de audiência registrou ausência injustificada da parte.' }
    ];
    const embedder = createFakeEmbedder({ dimensions: 32 });
    const index = await createRetrievalIndex({ chunks, embedder });
    const retrieval = await hybridRetrieve({ index, question: 'indenização danos morais', topK: 2 });
    assert.deepEqual(retrieval.diagnostics.sources, ['bm25', 'dense']);
    assert.equal(retrieval.diagnostics.bm25 > 0, true);
    assert.equal(retrieval.diagnostics.dense > 0, true);
    assert.equal(retrieval.results[0].chunkId, 'k1');
    const withoutEmbedder = await createRetrievalIndex({ chunks, embedder: null });
    const bm25Only = await hybridRetrieve({ index: withoutEmbedder, question: 'pericial' });
    assert.deepEqual(bm25Only.diagnostics.sources, ['bm25']);
    assert.equal(bm25Only.results[0].chunkId, 'k2');
  }

  console.log('[L8] Serviço RAG: flag, ingestão cifrada, resposta citada e avaliação...');
  {
    assert.throws(
      () => createLegalRagService({ env: {}, store: { put() {}, list() {} } }),
      error => error.code === 'DISABLED' && error.humanAction.includes('BETA_LEGAL_RAG')
    );

    const security = new SecurityManager({
      dataDirectory: path.join(tempRoot, 'ws-rag'),
      sessionSecret: randomBytes(32).toString('base64url'),
      encryptionKey: randomBytes(32).toString('base64'),
      secureCookies: false
    });
    await security.init();
    const store = new BetaStore({ dataDirectory: path.join(tempRoot, 'ws-rag'), securityManager: security });
    await store.init();
    try {
      const service = createLegalRagService({
        env: { BETA_LEGAL_RAG: 'true' },
        store,
        embedder: createFakeEmbedder()
      });
      await service.ingest({
        documentId: 'doc-sentenca',
        cnj: CNJ,
        documentType: 'SENTENCA',
        source: 'FIXTURE',
        date: '2024-02-20',
        party: 'Autora Teste',
        pages: [{ page: 3, text: 'O valor da causa foi fixado em R$ 15.000,00 e o pedido foi julgado procedente com condenação em honorários de sucumbência.' }]
      });
      await service.ingest({
        documentId: 'doc-pericia',
        cnj: CNJ,
        documentType: 'LAUDO',
        source: 'FIXTURE',
        date: '2024-01-10',
        pages: [{ page: 1, text: 'A perícia médica concluiu pela incapacidade parcial da autora, sem nexo com atividade laboral anterior.' }]
      });
      await service.ingest({
        documentId: 'doc-peticao',
        cnj: CNJ,
        documentType: 'PETICAO',
        source: 'FIXTURE',
        date: '2023-06-01',
        pages: [{ page: 2, text: 'A petição inicial pede indenização por danos morais no valor de R$ 20.000,00 e produção de prova pericial.' }]
      });
      assert.equal(service.embedder, 'fake');

      const answer = await service.ask({ question: 'Qual o valor da causa fixado?', cnj: CNJ });
      assert.equal(answer.status, 'OK');
      assert.equal(answer.citations.length > 0, true);
      assert.match(answer.answer, /chunk:/);
      assert.equal(answer.evidence[0].documentId, 'doc-sentenca');

      const loaded = service.listChunks({ cnj: CNJ });
      assert.equal(loaded.length >= 3, true);
      const chunkForValue = loaded.find(chunk => chunk.text.includes('valor da causa'));
      const chunkForPericia = loaded.find(chunk => chunk.text.includes('perícia médica'));
      const chunkForPedido = loaded.find(chunk => chunk.text.includes('pede indenização'));

      const dataset = [
        { id: 'fato-simples', question: 'Quem concluiu pela incapacidade parcial?', expectedChunkIds: [chunkForPericia.chunkId], expectAbstention: false, cnj: CNJ },
        { id: 'valor', question: 'Qual o valor da causa?', expectedChunkIds: [chunkForValue.chunkId], expectAbstention: false, cnj: CNJ },
        { id: 'pedido', question: 'O que a petição inicial pede?', expectedChunkIds: [chunkForPedido.chunkId], expectAbstention: false, cnj: CNJ },
        { id: 'decisao', question: 'O pedido foi julgado procedente?', expectedChunkIds: [chunkForValue.chunkId], expectAbstention: false, cnj: CNJ },
        { id: 'sem-corpus', question: 'Qual o teor do contrato de aluguel?', expectAbstention: true, cnj: EMPTY_CNJ },
        { id: 'fora-do-corpus', question: 'Qual a previsão do edital de licitação internacional?', expectAbstention: true, cnj: EMPTY_CNJ }
      ];
      const metrics = await service.evaluate({ dataset, k: 4 });
      assert.equal(metrics.total, 6);
      assert.equal(metrics.retrievalRecallAtK >= 0.8, true, `recall=${metrics.retrievalRecallAtK}`);
      assert.equal(metrics.citationAccuracy, 1);
      assert.equal(metrics.answerFaithfulness, 1);
      assert.equal(metrics.abstentionAccuracy >= 0.8, true, `abstention=${metrics.abstentionAccuracy}`);

      const emptyCorpusAnswer = await service.ask({ question: 'Qual o teor do contrato de aluguel?', cnj: EMPTY_CNJ });
      assert.equal(emptyCorpusAnswer.status, 'INSUFFICIENT_EVIDENCE');
      assert.equal(emptyCorpusAnswer.reason ?? emptyCorpusAnswer.reasons.includes('NO_EVIDENCE'), true);
    } finally {
      store.close();
    }

    const raw = await readFile(path.join(tempRoot, 'ws-rag', 'beta', 'ji-beta-v1.sqlite'), 'utf8').catch(() => '');
    assert.equal(raw.includes('valor da causa'), false, 'Chunks do RAG não podem ficar em claro no armazenamento beta.');

    const otherSecurity = new SecurityManager({
      dataDirectory: path.join(tempRoot, 'ws-rag-b'),
      sessionSecret: randomBytes(32).toString('base64url'),
      encryptionKey: randomBytes(32).toString('base64'),
      secureCookies: false
    });
    await otherSecurity.init();
    const otherStore = new BetaStore({ dataDirectory: path.join(tempRoot, 'ws-rag-b'), securityManager: otherSecurity });
    await otherStore.init();
    try {
      const otherService = createLegalRagService({ env: { BETA_LEGAL_RAG: 'true' }, store: otherStore, embedder: null });
      const isolated = await otherService.ask({ question: 'Qual o valor da causa?', cnj: CNJ });
      assert.equal(isolated.status, 'INSUFFICIENT_EVIDENCE', 'Workspace sem corpus não enxerga o corpus de outro workspace.');
    } finally {
      otherStore.close();
    }
  }

  console.log('[L9] Extração de texto: UTF-8, PDF com runner injetado e degradação honesta...');
  {
    const text = extractDocumentText({ mimeType: 'text/plain', bytes: Buffer.from('Petição inicial\n\nValor de R$ 1.000,00') });
    assert.equal(text.available, true);
    assert.equal(text.pages.length, 1);
    assert.match(text.pages[0].text, /R\$ 1\.000,00/);

    const pdf = extractDocumentText({
      mimeType: 'application/pdf',
      bytes: Buffer.from('%PDF-1.4 sintetico'),
      pdftotextPath: 'pdftotext-fake',
      runner: () => 'Primeira página\fSegunda página'
    });
    assert.equal(pdf.available, true);
    assert.equal(pdf.engine, 'pdftotext');
    assert.deepEqual(pdf.pages.map(page => page.page), [1, 2]);

    const resolvedPdftotext = findPdftotext({ env: {} });
    if (!resolvedPdftotext) {
      const unavailable = extractDocumentText({ mimeType: 'application/pdf', bytes: Buffer.from('%PDF'), pdftotextPath: null, env: {} });
      assert.equal(unavailable.available, false);
      assert.match(unavailable.humanAction, /pdftotext|poppler/i);
    } else {
      const { spawnSync } = await import('node:child_process');
      const probe = spawnSync('pdftotext', ['-v'], { encoding: 'utf8' });
      if (/xpdfreader/i.test(`${probe.stdout}${probe.stderr}`)) {
        console.log('[AVISO] pdftotext local é xpdf, sem leitura pela entrada padrão: extração real não verificada nesta máquina.');
      } else {
      const { createDeterministicTextPdf } = await import('../lib/documents/document-intelligence.mjs');
      const syntheticPdf = createDeterministicTextPdf('CONTEUDO SINTETICO DE TESTE DA EXTRACAO PDF');
      const real = extractDocumentText({ mimeType: 'application/pdf', bytes: syntheticPdf.binary, env: {} });
      assert.equal(real.available, true);
      assert.equal(real.engine, 'pdftotext');
      assert.equal(real.pages.length, syntheticPdf.pageCount);
      assert.match(real.pages.map(page => page.text).join(' '), /CONTEUDO SINTETICO DE TESTE/);
      assert.throws(
        () => extractDocumentText({ mimeType: 'application/pdf', bytes: Buffer.from('%PDF quebrado'), pdftotextPath: resolvedPdftotext, env: {} }),
        error => error.code === 'EXTRACTION_FAILED'
      );
      }
    }
    const image = extractDocumentText({ mimeType: 'image/png', bytes: Buffer.from([1, 2, 3]) });
    assert.equal(image.available, false);
    assert.match(image.humanAction, /OCR/);
  }

  console.log('✓ Legal RAG: chunking, BM25, RRF, rerank, citações, abstenção, avaliação e extração aprovados.');
} finally {
  const resolved = path.resolve(tempRoot);
  const safePrefix = path.resolve(os.tmpdir()) + path.sep;
  if (!resolved.startsWith(safePrefix) || !path.basename(resolved).startsWith('atrium-ji-rag-')) {
    throw new Error('Diretório temporário inesperado; limpeza cancelada.');
  }
  await rm(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 150 });
}
