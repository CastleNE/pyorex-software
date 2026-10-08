import { CHONDRITE, NUM_VARS, REE, type Sample } from './data';

/* Safe expression language for the Diagram Builder (no eval):
 *   numbers, variables (SiO2, Sr, Y, La…, alk, mg, eu…), + - * / ^, log10() ln() sqrt() abs() N(La) (chondrite-normalised),
 *   comparisons > < >= <= = !=, AND / OR / NOT (also y / o / no), strings "High-K", and `campo` / `field` = current field. */
type Tok = { t: 'num' | 'id' | 'str' | 'op' | '(' | ')' | ','; v: string };
type Node = { k: 'num'; v: number } | { k: 'str'; v: string } | { k: 'var'; v: string } | { k: 'fn'; f: string; a: Node } | { k: 'un'; op: string; a: Node } | { k: 'bin'; op: string; a: Node; b: Node };
export type Val = number | string | boolean | null;

function lex(src: string): Tok[] {
  const out: Tok[] = []; let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) { let j = i; while (j < src.length && /[0-9.eE]/.test(src[j])) j++; out.push({ t: 'num', v: src.slice(i, j) }); i = j; continue; }
    if (/[A-Za-zÀ-ÿ_]/.test(c)) { let j = i + 1; while (j < src.length && /[A-Za-z0-9À-ÿ_#]/.test(src[j])) j++; out.push({ t: 'id', v: src.slice(i, j) }); i = j; continue; }
    if (c === '"' || c === "'") { const j = src.indexOf(c, i + 1); if (j < 0) throw new Error('Comilla sin cerrar'); out.push({ t: 'str', v: src.slice(i + 1, j) }); i = j + 1; continue; }
    const two = src.slice(i, i + 2); if (['>=', '<=', '!=', '=='].includes(two)) { out.push({ t: 'op', v: two === '==' ? '=' : two }); i += 2; continue; }
    if ('+-*/^<>='.includes(c)) { out.push({ t: 'op', v: c }); i++; continue; }
    if (c === '(' || c === ')' || c === ',') { out.push({ t: c as '(' | ')' | ',', v: c }); i++; continue; }
    throw new Error(`Carácter no válido: ${c}`);
  }
  return out;
}
const KW: Record<string, string> = { AND: 'AND', Y: 'AND', OR: 'OR', O: 'OR', NOT: 'NOT', NO: 'NOT' };
function parse(src: string): Node {
  const toks = lex(src); let p = 0;
  const peek = () => toks[p]; const kw = () => (peek()?.t === 'id' ? KW[peek()!.v.toUpperCase()] : undefined);
  const or = (): Node => { let a = and(); while (kw() === 'OR') { p++; a = { k: 'bin', op: 'OR', a, b: and() }; } return a; };
  const and = (): Node => { let a = not(); while (kw() === 'AND') { p++; a = { k: 'bin', op: 'AND', a, b: not() }; } return a; };
  const not = (): Node => (kw() === 'NOT' ? (p++, { k: 'un', op: 'NOT', a: not() }) : cmp());
  const cmp = (): Node => { const a = add(); const t = peek(); if (t?.t === 'op' && ['>', '<', '>=', '<=', '=', '!='].includes(t.v)) { p++; return { k: 'bin', op: t.v, a, b: add() }; } return a; };
  const add = (): Node => { let a = mul(); while (peek()?.t === 'op' && (peek()!.v === '+' || peek()!.v === '-')) { const op = toks[p++].v; a = { k: 'bin', op, a, b: mul() }; } return a; };
  const mul = (): Node => { let a = pow(); while (peek()?.t === 'op' && (peek()!.v === '*' || peek()!.v === '/')) { const op = toks[p++].v; a = { k: 'bin', op, a, b: pow() }; } return a; };
  const pow = (): Node => { const a = un(); if (peek()?.t === 'op' && peek()!.v === '^') { p++; return { k: 'bin', op: '^', a, b: un() }; } return a; };
  const un = (): Node => (peek()?.t === 'op' && peek()!.v === '-' ? (p++, { k: 'un', op: '-', a: un() }) : prim());
  const prim = (): Node => {
    const t = toks[p++]; if (!t) throw new Error('Expresión incompleta');
    if (t.t === 'num') return { k: 'num', v: +t.v };
    if (t.t === 'str') return { k: 'str', v: t.v };
    if (t.t === '(') { const e = or(); if (toks[p++]?.t !== ')') throw new Error('Falta «)»'); return e; }
    if (t.t === 'id') { if (peek()?.t === '(') { p++; const a = or(); if (toks[p++]?.t !== ')') throw new Error('Falta «)»'); return { k: 'fn', f: t.v.toLowerCase(), a }; } return { k: 'var', v: t.v }; }
    throw new Error(`Inesperado: ${t.v}`);
  };
  const n = or(); if (p < toks.length) throw new Error(`Sobra: ${toks[p].v}`); return n;
}

const VARS = new Map(NUM_VARS.map(v => [v.key, v]));
const ALIAS: Record<string, string> = { 'Na2O+K2O': 'alk', 'Mg#': 'mg', 'Eu/Eu*': 'eu', FeO: 'FeOT', FeOt: 'FeOT', Fe2O3T: 'FeOT', campo: 'campo', field: 'campo' };
export interface Ctx { s?: Sample; field?: string | null; vars?: Record<string, number | null> }
function evalNode(n: Node, c: Ctx): Val {
  switch (n.k) {
    case 'num': return n.v; case 'str': return n.v;
    case 'var': {
      const key = ALIAS[n.v] ?? n.v; if (key === 'campo') return c.field ?? null;
      if (c.vars) { if (key in c.vars) return c.vars[key]; if (n.v in c.vars) return c.vars[n.v]; throw new Error(`Variable desconocida: ${n.v}`); }
      if (!c.s) throw new Error(`Variable desconocida: ${n.v}`);
      const v = VARS.get(key); if (v) return v.get(c.s);
      if ((REE as readonly string[]).includes(key)) return c.s.ree[key];
      throw new Error(`Variable desconocida: ${n.v}`);
    }
    case 'fn': {
      if (n.f === 'n' && n.a.k === 'var' && (REE as readonly string[]).includes(n.a.v) && c.s) return c.s.ree[n.a.v] / CHONDRITE[n.a.v];
      const a = evalNode(n.a, c); if (typeof a !== 'number') return null;
      if (n.f === 'log10' || n.f === 'log') return a > 0 ? Math.log10(a) : null; if (n.f === 'ln') return a > 0 ? Math.log(a) : null;
      if (n.f === 'sqrt') return a >= 0 ? Math.sqrt(a) : null; if (n.f === 'abs') return Math.abs(a);
      throw new Error(`Función desconocida: ${n.f}`);
    }
    case 'un': { const a = evalNode(n.a, c); return n.op === 'NOT' ? !a : typeof a === 'number' ? -a : null; }
    case 'bin': {
      if (n.op === 'AND') return !!evalNode(n.a, c) && !!evalNode(n.b, c); if (n.op === 'OR') return !!evalNode(n.a, c) || !!evalNode(n.b, c);
      const a = evalNode(n.a, c), b = evalNode(n.b, c); if (a == null || b == null) return null;
      if (n.op === '=') return String(a).toLowerCase() === String(b).toLowerCase(); if (n.op === '!=') return String(a).toLowerCase() !== String(b).toLowerCase();
      if (typeof a !== 'number' || typeof b !== 'number') return null;
      switch (n.op) { case '+': return a + b; case '-': return a - b; case '*': return a * b; case '/': return b === 0 ? null : a / b; case '^': return a ** b; case '>': return a > b; case '<': return a < b; case '>=': return a >= b; case '<=': return a <= b; }
    }
  }
  return null;
}
const cache = new Map<string, Node | Error>();
export function compile(src: string): { ok: true; run: (c: Ctx) => Val } | { ok: false; error: string } {
  let n = cache.get(src); if (!n) { try { n = parse(src); } catch (e) { n = e as Error; } cache.set(src, n); }
  if (n instanceof Error) return { ok: false, error: n.message };
  const node = n; return { ok: true, run: (c: Ctx) => { try { const v = evalNode(node, c); return typeof v === 'number' && !Number.isFinite(v) ? null : v; } catch { return null; } } };
}
export function checkExpr(src: string, numeric = true): string | null {
  const c = compile(src); if (!c.ok) return c.error;
  try { evalNode(parse(src), { s: { i: 0, id: '', sector: '', east: 0, north: 0, SiO2: 60, TiO2: 1, Al2O3: 15, FeOT: 5, MgO: 3, CaO: 5, Na2O: 3, K2O: 2, Cu: 10, Mo: 1, Rb: 50, Sr: 400, Y: 20, Ta: 1, ree: Object.fromEntries(REE.map(e => [e, 1])), total: 100 } as Sample, field: 'x' }); } catch (e) { return (e as Error).message; }
  void numeric; return null;
}
