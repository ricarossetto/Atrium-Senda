/**
 * ATRIUM — CNIS pela extração oficial da Fábrica de Cálculos
 *
 * Converte o resultado do endpoint oficial `documentos/cnis/ler` para o mesmo
 * formato usado pela leitura local (`vinculos`, `competencias`, `resumo`,
 * `avisos`), para a UI ter um único contrato de importação. Nada aqui persiste
 * ou registra PII: os dados seguem apenas para o fluxo autenticado do usuário.
 */

const FORMA_CONTAGEM_TIPO = Object.freeze({
  EMPREGADO: 'empregado',
  EMPREGADO_DOMESTICO: 'empregado_domestico',
  DOMESTICO: 'empregado_domestico',
  CONTRIBUINTE_INDIVIDUAL: 'contribuinte_individual',
  CONTRIBUINTE: 'contribuinte_individual',
  TRABALHADOR_AVULSO: 'avulso',
  AVULSO: 'avulso',
  SEGURADO_FACULTATIVO: 'facultativo',
  FACULTATIVO: 'facultativo',
  SEGURADO_ESPECIAL: 'rural',
  RURAL: 'rural',
  ESPECIAL_25: 'especial',
  ESPECIAL_20: 'especial',
  ESPECIAL_15: 'especial',
  ESPECIAL: 'especial'
});

export function normalizeFabricaDate(value) {
  const raw = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const iso = raw.match(/^(\d{4}-\d{2}-\d{2})T/);
  if (iso) return iso[1];
  return null;
}

export function normalizeFabricaMoney(value) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number') return Number.isFinite(value) ? value.toFixed(2) : '';
  const raw = String(value).replace(/R\$\s*/i, '').trim();
  if (/^\d{1,3}(\.\d{3})*,\d{2}$/.test(raw)) return raw.replaceAll('.', '').replace(',', '.');
  if (/^\d+,\d{2}$/.test(raw)) return raw.replace(',', '.');
  if (/^\d+(\.\d+)?$/.test(raw)) return Number(raw).toFixed(2);
  return '';
}

export function mapFabricaCnisResult(result = {}) {
  const avisos = [];
  const formaDesconhecida = new Set();

  const vinculos = (Array.isArray(result.periodosContribuicao) ? result.periodosContribuicao : [])
    .map(periodo => {
      const inicio = normalizeFabricaDate(periodo?.dataInicial);
      const fim = normalizeFabricaDate(periodo?.dataFinal);
      const forma = String(periodo?.formaContagem || '').trim().toUpperCase();
      const tipo = FORMA_CONTAGEM_TIPO[forma] || 'empregado';
      if (forma && !FORMA_CONTAGEM_TIPO[forma]) formaDesconhecida.add(forma);
      return {
        cnpj: null,
        empregador: String(periodo?.descricao || '').slice(0, 200) || 'Vínculo extraído do CNIS oficial',
        tipoFiliacao: forma || null,
        tipo,
        inicio,
        fim,
        origem: 'CNIS oficial',
        competencias: []
      };
    })
    .filter(vinculo => vinculo.inicio || vinculo.fim);

  const competencias = (Array.isArray(result.salarios) ? result.salarios : [])
    .map(salario => ({
      competencia: String(salario?.competencia || '').trim().slice(0, 7),
      salario: normalizeFabricaMoney(salario?.valor),
      indicadores: []
    }))
    .filter(item => /^\d{4}-\d{2}$/.test(item.competencia) && item.salario !== '')
    .sort((a, b) => (a.competencia < b.competencia ? -1 : 1));

  const semData = (Array.isArray(result.periodosContribuicao) ? result.periodosContribuicao : []).length - vinculos.length;
  if (semData > 0) avisos.push(`${semData} período(s) sem data utilizável não entraram na lista de vínculos.`);
  if (formaDesconhecida.size > 0) {
    avisos.push(`Enquadramento não reconhecido (${[...formaDesconhecida].slice(0, 4).join(', ')}) importado como Empregado; ajuste se necessário.`);
  }
  if (competencias.length === 0) avisos.push('A extração oficial não reconheceu competências com remuneração neste documento.');
  avisos.push('Períodos e salários extraídos pela Fábrica de Cálculos (TRF3); confira no extrato original antes de calcular.');

  const competenciaList = competencias.map(item => item.competencia);
  return {
    modo: 'oficial',
    fonte: 'fabrica',
    dadosSegurado: {
      nome: String(result?.dadosSegurado?.nome || '').slice(0, 200),
      cpf: String(result?.dadosSegurado?.cpf || '').slice(0, 20),
      nit: String(result?.dadosSegurado?.nit || '').slice(0, 24),
      nascimento: normalizeFabricaDate(result?.dadosSegurado?.nascimento) || '',
      mae: String(result?.dadosSegurado?.mae || '').slice(0, 200)
    },
    vinculos,
    beneficios: [],
    competencias,
    indicadores: [],
    lacunas: [],
    concomitancias: [],
    resumo: {
      vinculos: vinculos.length,
      competencias: competencias.length,
      beneficios: 0,
      indicadores: 0,
      lacunas: 0,
      concomitancias: 0,
      primeiraCompetencia: competenciaList[0],
      ultimaCompetencia: competenciaList[competenciaList.length - 1]
    },
    avisos
  };
}

/**
 * Une vínculos extraídos à lista da UI, sem duplicar (inicio+fim+tipo) e sem
 * apagar linhas manuais já preenchidas.
 */
export function mergeVinculosExtraidos(existentes = [], extraidos = []) {
  const list = Array.isArray(existentes) ? existentes : [];
  const out = list.filter(item => String(item?.inicio || '').trim() || String(item?.fim || '').trim());
  const seen = new Set(out.map(item => `${item.inicio || ''}|${item.fim || ''}|${item.tipo || ''}`));
  let added = 0;
  for (const vinculo of Array.isArray(extraidos) ? extraidos : []) {
    const key = `${vinculo.inicio || ''}|${vinculo.fim || ''}|${vinculo.tipo || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: `vinculo-${out.length + 1}`,
      inicio: vinculo.inicio || '',
      fim: vinculo.fim || '',
      tipo: vinculo.tipo || 'empregado',
      fator: '',
      origem: vinculo.origem || 'CNIS'
    });
    added += 1;
  }
  return { vinculos: out, added };
}
