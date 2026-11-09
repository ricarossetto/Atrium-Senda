export function rate(numerator, denominator) {
  return denominator === 0 ? null : Number((numerator / denominator).toFixed(4));
}

export async function evaluateRag({ dataset = [], ask, k = 5 } = {}) {
  if (typeof ask !== 'function') throw new TypeError('evaluateRag exige a função ask.');

  const details = [];
  let recallHits = 0;
  let recallTotal = 0;
  let citationOk = 0;
  let citationTotal = 0;
  let faithfulnessOk = 0;
  let faithfulnessTotal = 0;
  let abstentionOk = 0;
  let abstentionTotal = 0;

  for (const item of dataset) {
    const result = await ask({ question: item.question, topK: k, cnj: item.cnj ?? null });
    const retrievedIds = (result.evidence ?? []).map(entry => entry.chunkId);
    const abstained = result.status === 'INSUFFICIENT_EVIDENCE';

    if (Array.isArray(item.expectedChunkIds) && item.expectedChunkIds.length > 0) {
      recallTotal += 1;
      if (item.expectedChunkIds.some(chunkId => retrievedIds.includes(chunkId))) recallHits += 1;
    }

    if (item.expectAbstention === true) {
      abstentionTotal += 1;
      if (abstained) abstentionOk += 1;
    } else if (item.expectAbstention === false) {
      abstentionTotal += 1;
      if (!abstained) abstentionOk += 1;
      if (!abstained) {
        citationTotal += 1;
        if ((result.citations ?? []).length > 0) citationOk += 1;
        faithfulnessTotal += 1;
        const claims = result.claims ?? [];
        const verified = claims.length > 0 && claims.every(claim => claim.citations.length > 0);
        if (verified) faithfulnessOk += 1;
      }
    }

    details.push({
      id: item.id ?? null,
      question: item.question,
      status: result.status,
      confidence: result.confidence ?? null,
      retrieved: retrievedIds.length,
      expected: item.expectedChunkIds ?? []
    });
  }

  return {
    total: dataset.length,
    retrievalRecallAtK: rate(recallHits, recallTotal),
    citationAccuracy: rate(citationOk, citationTotal),
    answerFaithfulness: rate(faithfulnessOk, faithfulnessTotal),
    abstentionAccuracy: rate(abstentionOk, abstentionTotal),
    counts: {
      recall: `${recallHits}/${recallTotal}`,
      citation: `${citationOk}/${citationTotal}`,
      faithfulness: `${faithfulnessOk}/${faithfulnessTotal}`,
      abstention: `${abstentionOk}/${abstentionTotal}`
    },
    details
  };
}
