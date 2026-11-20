import {
  parseDec,
  add,
  sub,
  mul,
  div,
  powInt,
  nthRoot,
  roundTo,
  toFixedString
} from './decimal.mjs';

export class JurosTvmCivelError extends Error {
  constructor(message) {
    super(message);
    this.name = 'JurosTvmCivelError';
  }
}

const ONE = parseDec('1');
const HUNDRED = parseDec('100');
const ZERO = 0n;

const BASIS_SPECS = Object.freeze([
  { basis: 'dia_360', label: 'Taxa Diária (ano comercial 360d)', perYear: 360 },
  { basis: 'dia_365', label: 'Taxa Diária (ano civil 365d)', perYear: 365 },
  { basis: 'dia_252', label: 'Taxa por Dia Útil (252 d.u./ano)', perYear: 252 },
  { basis: 'mes', label: 'Taxa Mensal (30 dias)', perYear: 12 },
  { basis: 'trimestre', label: 'Taxa Trimestral (90 dias)', perYear: 4 },
  { basis: 'semestre', label: 'Taxa Semestral (180 dias)', perYear: 2 },
  { basis: 'ano', label: 'Taxa Anual (12 meses / 360d)', perYear: 1 }
]);

export function convertEquivalentRates({ ratePct, basis = 'mes', capitalizacao = 'composto' }) {
  const rate = parseDec(ratePct);
  if (rate <= parseDec('-100')) {
    throw new JurosTvmCivelError('A taxa de juros deve ser superior a -100%.');
  }
  const spec = BASIS_SPECS.find(item => item.basis === basis);
  if (!spec) throw new JurosTvmCivelError(`Base temporal inválida: ${basis}.`);

  const r = div(rate, HUNDRED);
  const annualFraction = capitalizacao === 'composto'
    ? sub(powInt(add(ONE, r), spec.perYear), ONE)
    : mul(r, parseDec(String(spec.perYear)));

  const equivalents = BASIS_SPECS.map(target => {
    const frac = capitalizacao === 'composto'
      ? (target.perYear === 1 ? annualFraction : sub(nthRoot(add(ONE, annualFraction), target.perYear), ONE))
      : div(annualFraction, parseDec(String(target.perYear)));
    return {
      basis: target.basis,
      label: target.label,
      ratePct: toFixedString(mul(frac, HUNDRED), 6)
    };
  });

  return {
    capitalizacao,
    inputRatePct: toFixedString(rate, 6),
    inputBasis: basis,
    equivalents
  };
}

function evalCompoundFactor(onePlusR, nperDec) {
  const nFloat = Number(toFixedString(nperDec, 8));
  if (Number.isInteger(nFloat) && Math.abs(nFloat) <= 1200) {
    return powInt(onePlusR, nFloat);
  }
  const rFloat = Number(toFixedString(onePlusR, 12));
  const val = Math.pow(rFloat, nFloat);
  return parseDec(val.toFixed(12));
}

export function solveTvm(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new JurosTvmCivelError('Parâmetros TVM inválidos.');
  }
  const solveFor = String(input.solveFor || 'fv').toLowerCase();
  if (!['pv', 'fv', 'pmt', 'rate', 'nper'].includes(solveFor)) {
    throw new JurosTvmCivelError(`Incógnita TVM inválida: ${solveFor}.`);
  }
  const capitalizacao = input.capitalizacao === 'simples' ? 'simples' : 'composto';
  const timing = input.timing === 'antecipado' ? 'antecipado' : 'vencido';
  const isDue = timing === 'antecipado';

  let pv = parseDec(input.pv ?? '0');
  let fv = parseDec(input.fv ?? '0');
  let pmt = parseDec(input.pmt ?? '0');
  let ratePct = parseDec(input.ratePct ?? '0');
  let nper = parseDec(input.nper ?? '0');
  const r = div(ratePct, HUNDRED);

  if (capitalizacao === 'simples' && pmt === ZERO && solveFor !== 'pmt') {
    if (solveFor === 'fv') {
      fv = mul(pv, add(ONE, mul(r, nper)));
    } else if (solveFor === 'pv') {
      pv = div(fv, add(ONE, mul(r, nper)));
    } else if (solveFor === 'rate') {
      if (pv === ZERO || nper === ZERO) throw new JurosTvmCivelError('PV e Prazo devem ser diferentes de zero.');
      ratePct = mul(div(sub(div(fv, pv), ONE), nper), HUNDRED);
    } else if (solveFor === 'nper') {
      if (pv === ZERO || r === ZERO) throw new JurosTvmCivelError('PV e Taxa devem ser diferentes de zero.');
      nper = div(sub(div(fv, pv), ONE), r);
    }
    const pvRound = roundTo(pv, 2, 'half-up');
    const fvRound = roundTo(fv, 2, 'half-up');
    return {
      solvedField: solveFor,
      capitalizacao: 'simples',
      timing,
      pv: toFixedString(pvRound, 2),
      fv: toFixedString(fvRound, 2),
      pmt: '0.00',
      ratePct: toFixedString(ratePct, 6),
      nper: toFixedString(nper, 4),
      totalJurosEstimado: toFixedString(sub(fvRound, pvRound), 2)
    };
  }

  const dueFactor = rate => (isDue ? add(ONE, rate) : ONE);

  if (solveFor === 'fv') {
    const pow = evalCompoundFactor(add(ONE, r), nper);
    if (pmt === ZERO) {
      fv = mul(pv, pow);
    } else if (r === ZERO) {
      fv = add(pv, mul(pmt, nper));
    } else {
      const pmtAcc = div(mul(mul(pmt, dueFactor(r)), sub(pow, ONE)), r);
      fv = add(mul(pv, pow), pmtAcc);
    }
  } else if (solveFor === 'pv') {
    const pow = evalCompoundFactor(add(ONE, r), nper);
    if (pmt === ZERO) {
      pv = div(fv, pow);
    } else if (r === ZERO) {
      pv = add(mul(pmt, nper), fv);
    } else {
      const invPow = div(ONE, pow);
      const pmtPv = div(mul(mul(pmt, dueFactor(r)), sub(ONE, invPow)), r);
      pv = add(pmtPv, div(fv, pow));
    }
  } else if (solveFor === 'pmt') {
    if (nper <= ZERO) throw new JurosTvmCivelError('O prazo deve ser maior que zero.');
    if (r === ZERO) {
      pmt = div(sub(pv, fv), nper);
    } else {
      const pow = evalCompoundFactor(add(ONE, r), nper);
      const invPow = div(ONE, pow);
      const pvNet = sub(pv, div(fv, pow));
      pmt = div(mul(pvNet, r), mul(dueFactor(r), sub(ONE, invPow)));
    }
  } else if (solveFor === 'nper') {
    if (pmt === ZERO) {
      if (pv <= ZERO || fv <= ZERO || r <= ZERO) {
        throw new JurosTvmCivelError('PV, FV e Taxa devem ser positivos para calcular o prazo.');
      }
      const ratio = Number(toFixedString(div(fv, pv), 12));
      const onePlus = Number(toFixedString(add(ONE, r), 12));
      nper = parseDec((Math.log(ratio) / Math.log(onePlus)).toFixed(8));
    } else if (r === ZERO) {
      nper = div(sub(pv, fv), pmt);
    } else {
      const pmtAdj = mul(pmt, dueFactor(r));
      const num = sub(pmtAdj, mul(fv, r));
      const den = sub(pmtAdj, mul(pv, r));
      if (num <= ZERO || den <= ZERO) {
        throw new JurosTvmCivelError('Prestação insuficiente para amortizar os juros da taxa informada.');
      }
      const ratio = Number(toFixedString(div(num, den), 12));
      const onePlus = Number(toFixedString(add(ONE, r), 12));
      nper = parseDec((Math.log(ratio) / Math.log(onePlus)).toFixed(8));
    }
  } else if (solveFor === 'rate') {
    if (pmt === ZERO) {
      if (pv <= ZERO || fv <= ZERO || nper <= ZERO) {
        throw new JurosTvmCivelError('PV, FV e Prazo devem ser positivos para calcular a taxa.');
      }
      const nInt = Math.trunc(Number(toFixedString(nper, 4)));
      const ratio = div(fv, pv);
      const root = Number.isInteger(nInt) && nInt > 0
        ? nthRoot(ratio, nInt)
        : parseDec(Math.pow(Number(toFixedString(ratio, 12)), 1 / Number(toFixedString(nper, 8))).toFixed(12));
      ratePct = mul(sub(root, ONE), HUNDRED);
    } else {
      let guess = parseDec('0.01');
      const eps = parseDec('0.00000001');
      for (let iter = 0; iter < 70; iter += 1) {
        if (guess === ZERO) guess = parseDec('0.0000001');
        const evalF = g => {
          const op = add(ONE, g);
          const pow = evalCompoundFactor(op, nper);
          const invPow = div(ONE, pow);
          const df = isDue ? op : ONE;
          const annuity = div(mul(mul(pmt, df), sub(ONE, invPow)), g);
          return sub(add(annuity, mul(fv, invPow)), pv);
        };
        const f1 = evalF(guess);
        const absF = f1 >= ZERO ? f1 : -f1;
        if (absF <= parseDec('0.0000001')) break;
        const f2 = evalF(add(guess, eps));
        const deriv = div(sub(f2, f1), eps);
        if (deriv === ZERO) break;
        const next = sub(guess, div(f1, deriv));
        guess = next <= parseDec('-0.99') ? div(guess, parseDec('2')) : next;
      }
      ratePct = mul(guess, HUNDRED);
    }
  }

  const pvR = roundTo(pv, 2, 'half-up');
  const fvR = roundTo(fv, 2, 'half-up');
  const pmtR = roundTo(pmt, 2, 'half-up');
  const totalJuros = pmtR === ZERO ? sub(fvR, pvR) : sub(add(mul(pmtR, nper), fvR), pvR);

  return {
    solvedField: solveFor,
    capitalizacao: 'composto',
    timing,
    pv: toFixedString(pvR, 2),
    fv: toFixedString(fvR, 2),
    pmt: toFixedString(pmtR, 2),
    ratePct: toFixedString(ratePct, 6),
    nper: toFixedString(nper, 4),
    totalJurosEstimado: toFixedString(roundTo(totalJuros, 2, 'half-up'), 2)
  };
}

export function buildJurosTvmCalculation(input) {
  const ratePct = input?.ratePct ?? input?.equivalencia?.ratePct ?? '1.00';
  const basis = input?.basis ?? input?.equivalencia?.basis ?? 'mes';
  const eqComposto = convertEquivalentRates({ ratePct, basis, capitalizacao: 'composto' });
  const eqSimples = convertEquivalentRates({ ratePct, basis, capitalizacao: 'simples' });
  const tvm = input?.tvm ? solveTvm(input.tvm) : (input?.solveFor ? solveTvm(input) : null);

  return {
    modalidade: 'juros_tvm',
    equivalencia: {
      composto: eqComposto,
      simples: eqSimples
    },
    tvm,
    resumo: {
      taxaBasePct: eqComposto.inputRatePct,
      baseTemporal: basis,
      ...(tvm ? {
        incognitaResolvida: tvm.solvedField,
        pv: tvm.pv,
        fv: tvm.fv,
        pmt: tvm.pmt,
        ratePct: tvm.ratePct,
        nper: tvm.nper,
        totalJurosEstimado: tvm.totalJurosEstimado,
        total: tvm.solvedField === 'pmt' ? tvm.pmt : (parseDec(tvm.fv) > ZERO ? tvm.fv : tvm.pv)
      } : {
        total: '0.00'
      })
    }
  };
}
