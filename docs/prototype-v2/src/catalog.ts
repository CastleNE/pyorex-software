import { useApp } from './store';
import { TOOLS, availability, type Availability, type Need, type ToolDef } from './tools';
import type { Txt } from './i18n';
import type { Column } from './data';

/* Full diagram catalog, placed by area and ribbon group. Every entry opens from its own group's gallery.
 * 'impl' = in the repo registry · 'proto' = working in this prototype · 'plan' = registry "planned" · 'prop' = new.
 * Proposed diagrams open with their real axes computed on the user's data; classification fields still have to be
 * digitised from the source (Diagram Builder → Edit) — they are never invented here. */
export type CatStatus = 'impl' | 'proto' | 'plan' | 'prop';
export type CatPlot = { kind: 'xy'; x: string; y: string; logX?: boolean; logY?: boolean; rules?: { name: string; cond: string; color: string }[] } | { kind: 'tern'; a: string; b: string; c: string; la: string; lb: string; lc: string };
export interface CatEntry { id: string; g: string; sub?: Txt; name: Txt; axes: string; ref: string; st: CatStatus; tool?: string; plot?: CatPlot; req?: string[]; needs?: Need; note?: Txt }

// millications and molar oxides (expression fragments)
const Si = '(SiO2/60.08*1000)', Ti = '(TiO2/79.87*1000)', Al = '(Al2O3/101.96*2000)', Fe = '(FeOT/71.85*1000)', Mg = '(MgO/40.3*1000)', Ca = '(CaO/56.08*1000)', Na = '(Na2O/61.98*2000)', K = '(K2O/94.2*2000)';
const mAl = '(Al2O3/101.96)', mCa = '(CaO/56.08)', mNa = '(Na2O/61.98)', mK = '(K2O/94.2)', mMg = '(MgO/40.3)';
const S = '(SiO2/60.08 + TiO2/79.87 + Al2O3/101.96*2 + FeOT/71.85 + MnO/70.94 + MgO/40.3 + CaO/56.08 + Na2O/61.98*2 + K2O/94.2*2 + P2O5/141.94*2)';
const M = `((Na2O/61.98*2 + K2O/94.2*2 + 2*CaO/56.08) * ${S} / ((Al2O3/101.96*2) * (SiO2/60.08)))`;
const OX = ['SiO2', 'TiO2', 'Al2O3', 'FeOT', 'MgO', 'CaO', 'Na2O', 'K2O'];
const t = (es: string, en: string): Txt => ({ es, en });
const GRAN = t('Granitoides', 'Granitoids'), BAS = t('Basaltos y rocas máficas', 'Basalts and mafic rocks'), WEA = t('Meteorización y regolito', 'Weathering and regolith'), ZIR = t('Requiere química de zircón', 'Needs zircon chemistry');

export const CATALOG: CatEntry[] = [
  /* ---------- Lithogeochemistry · Classification ---------- */
  { id: 'tasv', g: 'class', name: t('TAS volcánico', 'Volcanic TAS'), axes: 'Na2O + K2O vs SiO2', ref: 'Le Bas et al. (1986)', st: 'impl', tool: 'tas' },
  { id: 'tasp', g: 'class', name: t('TAS plutónico', 'Plutonic TAS'), axes: 'Na2O + K2O vs SiO2', ref: 'Middlemost (1994)', st: 'proto', tool: 'tas' },
  { id: 'tascox', g: 'class', name: t('TAS plutónico (Cox)', 'Plutonic TAS (Cox)'), axes: 'Na2O + K2O vs SiO2', ref: 'Cox et al. (1979); Wilson (1989)', st: 'prop', req: ['SiO2', 'Na2O', 'K2O'], plot: { kind: 'xy', x: 'SiO2', y: 'Na2O + K2O' } },
  { id: 'qapf', g: 'class', name: t('QAPF modal', 'Modal QAPF'), axes: 'Q–A–P–F', ref: 'Streckeisen (1976); Le Maitre (2002)', st: 'impl', tool: 'qapf' },
  { id: 'qapfn', g: 'class', name: t('QAPF normativo', 'Normative QAPF'), axes: 'CIPW → QAPF', ref: 'Streckeisen y Le Maitre (1979)', st: 'prop', needs: 'norm' },
  { id: 'r1r2', g: 'class', name: t('R1–R2', 'R1–R2'), axes: 'R1 = 4Si − 11(Na+K) − 2(Fe+Ti) · R2 = 6Ca + 2Mg + Al', ref: 'De la Roche et al. (1980)', st: 'prop', req: OX, plot: { kind: 'xy', x: `4*${Si} - 11*(${Na} + ${K}) - 2*(${Fe} + ${Ti})`, y: `6*${Ca} + 2*${Mg} + ${Al}` } },
  { id: 'wf77', g: 'class', name: t('Zr/TiO₂ vs Nb/Y', 'Zr/TiO₂ vs Nb/Y'), axes: 'inmóviles · rocas alteradas', ref: 'Winchester y Floyd (1977)', st: 'plan', req: ['Zr', 'TiO2', 'Nb', 'Y'], plot: { kind: 'xy', x: 'Nb / Y', y: 'Zr / (TiO2 * 10000)', logX: true, logY: true } },
  { id: 'p96c', g: 'class', name: t('Zr/Ti vs Nb/Y', 'Zr/Ti vs Nb/Y'), axes: 'revisión de Winchester y Floyd', ref: 'Pearce (1996)', st: 'prop', req: ['Zr', 'TiO2', 'Nb', 'Y'], plot: { kind: 'xy', x: 'Nb / Y', y: 'Zr / (TiO2 * 5995)', logX: true, logY: true } },
  { id: 'coth', g: 'class', name: t('Co–Th', 'Co–Th'), axes: 'rocas de arco alteradas', ref: 'Hastie et al. (2007)', st: 'prop', req: ['Co', 'Th'] },
  { id: 'jensen', g: 'class', name: t('Gráfico catiónico de Jensen', 'Jensen cation plot'), axes: 'Al – (FeT + Ti) – Mg', ref: 'Jensen (1976)', st: 'prop', req: ['Al2O3', 'FeOT', 'TiO2', 'MgO'], plot: { kind: 'tern', a: Al, b: `${Fe} + ${Ti}`, c: Mg, la: 'Al', lb: 'FeT + Ti', lc: 'Mg' } },
  { id: 'anabor', g: 'class', name: t('An–Ab–Or normativo', 'Normative An–Ab–Or'), axes: 'tonalita · trondhjemita · granodiorita', ref: "O'Connor (1965); Barker (1979)", st: 'prop', needs: 'norm' },
  { id: 'pq', g: 'class', name: t('P–Q', 'P–Q'), axes: 'P = K − (Na + Ca) · Q = Si/3 − (K + Na + 2Ca/3)', ref: 'Debon y Le Fort (1983)', st: 'prop', req: OX, plot: { kind: 'xy', x: `${K} - (${Na} + ${Ca})`, y: `${Si}/3 - (${K} + ${Na} + 2*${Ca}/3)` } },

  /* ---------- Magmatic series ---------- */
  { id: 'afm', g: 'series', name: t('AFM', 'AFM'), axes: '(Na2O + K2O) – FeOT – MgO', ref: 'Irvine y Baragar (1971)', st: 'impl', tool: 'afm' },
  { id: 'k2o', g: 'series', name: t('K₂O–SiO₂', 'K₂O–SiO₂'), axes: 'K2O vs SiO2', ref: 'Peccerillo y Taylor (1976)', st: 'impl', tool: 'k2o' },
  { id: 'mali', g: 'series', name: t('MALI', 'MALI'), axes: 'Na2O + K2O − CaO vs SiO2', ref: 'Frost et al. (2001)', st: 'impl', tool: 'mali' },
  { id: 'feidx', g: 'series', name: t('Fe-index', 'Fe-index'), axes: 'FeOT / (FeOT + MgO) vs SiO2', ref: 'Frost et al. (2001); Frost y Frost (2008)', st: 'impl', tool: 'feidx' },
  { id: 'alkidx', g: 'series', name: t('Índice de alcalinidad', 'Alkalinity index'), axes: 'Al − (Na + K) molar vs SiO2', ref: 'Frost y Frost (2008)', st: 'prop', req: ['SiO2', 'Al2O3', 'Na2O', 'K2O'], plot: { kind: 'xy', x: 'SiO2', y: `${Al} - (${Na} + ${K})` } },
  { id: 'miya', g: 'series', name: t('FeOT/MgO vs SiO₂', 'FeOT/MgO vs SiO₂'), axes: 'toleítico vs calcoalcalino', ref: 'Miyashiro (1974)', st: 'prop', req: ['SiO2', 'FeOT', 'MgO'], plot: { kind: 'xy', x: 'SiO2', y: 'FeOT / MgO' } },
  { id: 'alksub', g: 'series', name: t('Alcalino vs subalcalino', 'Alkaline vs subalkaline'), axes: 'línea sobre el TAS', ref: 'Irvine y Baragar (1971)', st: 'prop', req: ['SiO2', 'Na2O', 'K2O'], plot: { kind: 'xy', x: 'SiO2', y: 'Na2O + K2O' } },

  /* ---------- Alumina saturation ---------- */
  { id: 'shand', g: 'alumina', name: t('Shand', 'Shand'), axes: 'A/CNK vs A/NK', ref: 'Maniar y Piccoli (1989)', st: 'impl', tool: 'shand' },
  { id: 'acnk', g: 'alumina', name: t('A/CNK', 'A/CNK'), axes: 'molar', ref: 'Shand (1943)', st: 'impl', tool: 'acnk' },
  { id: 'ank', g: 'alumina', name: t('A/NK', 'A/NK'), axes: 'molar', ref: 'Shand (1943)', st: 'impl', tool: 'ank' },
  { id: 'ab', g: 'alumina', name: t('A–B (granitos peralumínicos)', 'A–B (peraluminous granites)'), axes: 'A = Al − (K + Na + 2Ca) · B = Fe + Mg + Ti', ref: 'Debon y Le Fort (1983); Villaseca et al. (1998)', st: 'prop', req: OX, plot: { kind: 'xy', x: `${Fe} + ${Mg} + ${Ti}`, y: `${Al} - (${K} + ${Na} + 2*${Ca})` } },
  { id: 'is', g: 'alumina', name: t('Granitos tipo I y S', 'I- and S-type granites'), axes: 'criterios químicos como reglas', ref: 'Chappell y White (1974)', st: 'prop', req: ['Al2O3', 'CaO', 'Na2O', 'K2O'], plot: { kind: 'xy', x: 'SiO2', y: 'acnk', rules: [{ name: 'Tipo S (A/CNK > 1,1)', cond: 'acnk > 1.1', color: '#cc79a7' }, { name: 'Tipo I (A/CNK ≤ 1,1)', cond: 'acnk <= 1.1', color: '#0072b2' }] } },

  /* ---------- Variation ---------- */
  { id: 'harker', g: 'variation', name: t('Harker', 'Harker'), axes: 'SiO2 vs cada óxido', ref: 'Harker (1909)', st: 'impl', tool: 'harker' },
  { id: 'fenner', g: 'variation', name: t('Fenner', 'Fenner'), axes: 'MgO como índice de diferenciación', ref: 'uso clásico', st: 'prop', req: ['MgO', 'SiO2'], plot: { kind: 'xy', x: 'MgO', y: 'SiO2' } },
  { id: 'per', g: 'variation', name: t('Razones de elementos de Pearce', 'Pearce element ratios'), axes: 'ejemplo: (Mg+Fe)/K vs Si/K', ref: 'Pearce (1968); Russell y Nicholls (1988)', st: 'prop', req: ['SiO2', 'MgO', 'FeOT', 'K2O'], plot: { kind: 'xy', x: `${Si} / ${K}`, y: `(${Mg} + ${Fe}) / ${K}` } },

  /* ---------- Tectonic discrimination ---------- */
  { id: 'whalen', g: 'tect', sub: GRAN, name: t('Granitos tipo A', 'A-type granites'), axes: 'Ga/Al vs Zr, Nb, Ce, Y', ref: 'Whalen et al. (1987)', st: 'prop', req: ['Ga', 'Al2O3', 'Zr'] },
  { id: 'eby', g: 'tect', sub: GRAN, name: t('Subtipos A1 y A2', 'A1 and A2 subtypes'), axes: 'Nb – Y – Ce', ref: 'Eby (1992)', st: 'prop', req: ['Nb', 'Y', 'Ce'], plot: { kind: 'tern', a: 'Nb', b: 'Y', c: 'Ce', la: 'Nb', lb: 'Y', lc: 'Ce' } },
  { id: 'pearce84', g: 'tect', sub: GRAN, name: t('Rb vs Y + Nb', 'Rb vs Y + Nb'), axes: 'VAG · syn-COLG · WPG · ORG', ref: 'Pearce et al. (1984)', st: 'plan', req: ['Rb', 'Y', 'Nb'], plot: { kind: 'xy', x: 'Y + Nb', y: 'Rb', logX: true, logY: true } },
  { id: 'pearce84b', g: 'tect', sub: GRAN, name: t('Nb vs Y', 'Nb vs Y'), axes: 'misma serie', ref: 'Pearce et al. (1984)', st: 'plan', req: ['Nb', 'Y'], plot: { kind: 'xy', x: 'Y', y: 'Nb', logX: true, logY: true } },
  { id: 'pearce84c', g: 'tect', sub: GRAN, name: t('Ta vs Yb', 'Ta vs Yb'), axes: 'misma serie', ref: 'Pearce et al. (1984)', st: 'plan', req: ['Ta', 'Yb'], plot: { kind: 'xy', x: 'Yb', y: 'Ta', logX: true, logY: true } },
  { id: 'p96pc', g: 'tect', sub: GRAN, name: t('Rb vs Y + Nb · poscolisional', 'Rb vs Y + Nb · post-collisional'), axes: 'campo post-COLG', ref: 'Pearce (1996)', st: 'prop', req: ['Rb', 'Y', 'Nb'], plot: { kind: 'xy', x: 'Y + Nb', y: 'Rb', logX: true, logY: true } },
  { id: 'hrt', g: 'tect', sub: GRAN, name: t('Hf – Rb/30 – 3Ta', 'Hf – Rb/30 – 3Ta'), axes: 'ternario', ref: 'Harris et al. (1986)', st: 'prop', req: ['Hf', 'Rb', 'Ta'], plot: { kind: 'tern', a: 'Hf', b: 'Rb / 30', c: 'Ta * 3', la: 'Hf', lb: 'Rb/30', lc: '3Ta' } },
  { id: 'bb85', g: 'tect', sub: GRAN, name: t('R1–R2 tectónico', 'Tectonic R1–R2'), axes: 'R1–R2 con campos geodinámicos', ref: 'Batchelor y Bowden (1985)', st: 'prop', req: OX, plot: { kind: 'xy', x: `4*${Si} - 11*(${Na} + ${K}) - 2*(${Fe} + ${Ti})`, y: `6*${Ca} + 2*${Mg} + ${Al}` } },
  { id: 'mp89', g: 'tect', sub: GRAN, name: t('Discriminación con mayores', 'Major-element discrimination'), axes: 'FeOT/(FeOT + MgO) vs SiO2 (uno de la serie)', ref: 'Maniar y Piccoli (1989)', st: 'prop', req: ['SiO2', 'FeOT', 'MgO'], plot: { kind: 'xy', x: 'SiO2', y: 'FeOT / (FeOT + MgO)' } },
  { id: 'sg02', g: 'tect', sub: GRAN, name: t('Th/Ta vs Yb', 'Th/Ta vs Yb'), axes: 'volcánicas félsicas', ref: 'Schandl y Gorton (2002)', st: 'prop', req: ['Th', 'Ta', 'Yb'], plot: { kind: 'xy', x: 'Yb', y: 'Th / Ta', logX: true, logY: true } },
  { id: 'pc73', g: 'tect', sub: BAS, name: t('Ti – Zr – Y', 'Ti – Zr – Y'), axes: 'Ti/100 – Zr – 3Y', ref: 'Pearce y Cann (1973)', st: 'prop', req: ['TiO2', 'Zr', 'Y'], plot: { kind: 'tern', a: 'TiO2 * 5995 / 100', b: 'Zr', c: 'Y * 3', la: 'Ti/100', lb: 'Zr', lc: '3Y' } },
  { id: 'pn79', g: 'tect', sub: BAS, name: t('Zr/Y vs Zr', 'Zr/Y vs Zr'), axes: 'arco · intraplaca · MORB', ref: 'Pearce y Norry (1979)', st: 'prop', req: ['Zr', 'Y'], plot: { kind: 'xy', x: 'Zr', y: 'Zr / Y', logX: true, logY: true } },
  { id: 'w80', g: 'tect', sub: BAS, name: t('Th – Hf/3 – Ta', 'Th – Hf/3 – Ta'), axes: 'ternario', ref: 'Wood (1980)', st: 'prop', req: ['Th', 'Hf', 'Ta'], plot: { kind: 'tern', a: 'Th', b: 'Hf / 3', c: 'Ta', la: 'Th', lb: 'Hf/3', lc: 'Ta' } },
  { id: 'm86', g: 'tect', sub: BAS, name: t('2Nb – Zr/4 – Y', '2Nb – Zr/4 – Y'), axes: 'ternario', ref: 'Meschede (1986)', st: 'prop', req: ['Nb', 'Zr', 'Y'], plot: { kind: 'tern', a: 'Nb * 2', b: 'Zr / 4', c: 'Y', la: '2Nb', lb: 'Zr/4', lc: 'Y' } },
  { id: 'sh82', g: 'tect', sub: BAS, name: t('V vs Ti/1000', 'V vs Ti/1000'), axes: 'arco · MORB · OIB', ref: 'Shervais (1982)', st: 'prop', req: ['V', 'TiO2'] },
  { id: 'p08', g: 'tect', sub: BAS, name: t('Th/Yb vs Nb/Yb', 'Th/Yb vs Nb/Yb'), axes: 'arreglo del manto y aporte de subducción', ref: 'Pearce (2008)', st: 'prop', req: ['Th', 'Nb', 'Yb'], plot: { kind: 'xy', x: 'Nb / Yb', y: 'Th / Yb', logX: true, logY: true } },
  { id: 'cl89', g: 'tect', sub: BAS, name: t('La/10 – Y/15 – Nb/8', 'La/10 – Y/15 – Nb/8'), axes: 'ternario', ref: 'Cabanis y Lecolle (1989)', st: 'prop', req: ['La', 'Y', 'Nb'], plot: { kind: 'tern', a: 'La / 10', b: 'Y / 15', c: 'Nb / 8', la: 'La/10', lb: 'Y/15', lc: 'Nb/8' } },
  { id: 'mu83', g: 'tect', sub: BAS, name: t('MnO – TiO₂ – P₂O₅', 'MnO – TiO₂ – P₂O₅'), axes: '10MnO – TiO2 – 10P2O5', ref: 'Mullen (1983)', st: 'prop', req: ['MnO', 'TiO2', 'P2O5'], plot: { kind: 'tern', a: 'MnO * 10', b: 'TiO2', c: 'P2O5 * 10', la: '10MnO', lb: 'TiO₂', lc: '10P₂O₅' } },
  { id: 'p75', g: 'tect', sub: BAS, name: t('TiO₂ – K₂O – P₂O₅', 'TiO₂ – K₂O – P₂O₅'), axes: 'oceánico vs continental', ref: 'Pearce et al. (1975)', st: 'prop', req: ['TiO2', 'K2O', 'P2O5'], plot: { kind: 'tern', a: 'TiO2', b: 'K2O', c: 'P2O5', la: 'TiO₂', lb: 'K₂O', lc: 'P₂O₅' } },

  /* ---------- Trace & normalisation ---------- */
  { id: 'ree', g: 'trace', name: t('REE · condrito', 'REE · chondrite'), axes: 'C / C condrito', ref: 'Sun y McDonough (1989)', st: 'impl', tool: 'ree' },
  { id: 'pm', g: 'trace', name: t('Multielementos · manto primitivo', 'Multi-element · primitive mantle'), axes: 'C / C manto primitivo', ref: 'Sun y McDonough (1989)', st: 'impl', tool: 'multi' },
  { id: 'norms', g: 'trace', name: t('Otras normalizaciones', 'Other normalisations'), axes: 'condrito, manto, MORB, OIB, corteza, PAAS', ref: 'Boynton (1984); McDonough y Sun (1995); Palme y O\'Neill (2014); Gale et al. (2013); Rudnick y Gao (2003); Taylor y McLennan (1985)', st: 'prop', needs: 'nextPhase' },
  { id: 'eu', g: 'trace', name: t('Eu/Eu*', 'Eu/Eu*'), axes: 'EuN / √(SmN · GdN)', ref: 'Sun y McDonough (1989)', st: 'impl', tool: 'eu' },
  { id: 'ce', g: 'trace', name: t('Ce/Ce*', 'Ce/Ce*'), axes: 'CeN / √(LaN · PrN)', ref: 'Sun y McDonough (1989)', st: 'impl', tool: 'ce' },
  { id: 'laybyb', g: 'trace', name: t('(La/Yb)N vs YbN', '(La/Yb)N vs YbN'), axes: 'granate residual · TTG · adakitas', ref: 'Martin (1986)', st: 'prop', req: ['La', 'Yb'], plot: { kind: 'xy', x: 'N(Yb)', y: 'N(La) / N(Yb)', logX: true, logY: true } },
  { id: 'dydy', g: 'trace', name: t('Dy/Dy* vs Dy/Yb', 'Dy/Dy* vs Dy/Yb'), axes: 'forma de REE medias y pesadas', ref: 'Davidson et al. (2013)', st: 'prop', req: ['La', 'Dy', 'Yb'], plot: { kind: 'xy', x: 'N(Dy) / N(Yb)', y: 'N(Dy) / (N(La)^(4/13) * N(Yb)^(9/13))' } },
  { id: 'bala', g: 'trace', name: t('Ba/La vs Th/Yb', 'Ba/La vs Th/Yb'), axes: 'fluidos vs sedimentos de subducción', ref: 'Pearce y Peate (1995)', st: 'prop', req: ['Ba', 'La', 'Th', 'Yb'], plot: { kind: 'xy', x: 'Th / Yb', y: 'Ba / La', logX: true } },

  /* ---------- Petrogenesis & thermometry ---------- */
  { id: 'adak', g: 'petro', name: t('Sr/Y vs Y · adakitas', 'Sr/Y vs Y · adakites'), axes: 'firma adakítica', ref: 'Defant y Drummond (1990)', st: 'proto', tool: 'sry' },
  { id: 'dyyb', g: 'petro', name: t('Dy/Yb vs SiO₂', 'Dy/Yb vs SiO₂'), axes: 'anfíbol vs granate', ref: 'Davidson et al. (2007)', st: 'proto', tool: 'dyyb' },
  { id: 'zrsat', g: 'petro', name: t('Saturación de zircón', 'Zircon saturation'), axes: 'T = 12900 / (2,95 + 0,85M + ln(496000/Zr))', ref: 'Watson y Harrison (1983); Boehnke et al. (2013)', st: 'prop', req: ['Zr', ...OX, 'MnO', 'P2O5'], plot: { kind: 'xy', x: 'SiO2', y: `12900 / (2.95 + 0.85 * ${M} + ln(496000 / Zr)) - 273.15` } },
  { id: 'apsat', g: 'petro', name: t('Saturación de apatito', 'Apatite saturation'), axes: 'T desde P2O5 y SiO2', ref: 'Harrison y Watson (1984)', st: 'prop', req: ['SiO2', 'P2O5'], plot: { kind: 'xy', x: 'SiO2', y: '(8400 + (SiO2/100 - 0.5) * 26400) / (ln(42 / P2O5) + 3.1 + 12.4 * (SiO2/100 - 0.5)) - 273.15' } },
  { id: 'monsat', g: 'petro', name: t('Saturación de monacita', 'Monazite saturation'), axes: 'T desde REE ligeras y H2O', ref: 'Montel (1993)', st: 'prop', req: ['H2O'] },
  { id: 'tizr', g: 'petro', name: t('Ti en zircón', 'Ti-in-zircon'), axes: 'temperatura de cristalización', ref: 'Ferry y Watson (2007)', st: 'prop', req: ['Ti (zircón)'], note: ZIR },

  /* ---------- Mineral exploration · Fertility ---------- */
  { id: 'srysi', g: 'fert', name: t('Sr/Y vs SiO₂', 'Sr/Y vs SiO₂'), axes: 'magmas fértiles para pórfidos', ref: 'Richards (2011); Loucks (2014)', st: 'prop', req: ['Sr', 'Y', 'SiO2'], plot: { kind: 'xy', x: 'SiO2', y: 'Sr / Y' } },
  { id: 'sry', g: 'fert', name: t('Sr/Y vs Y', 'Sr/Y vs Y'), axes: 'arcos fértiles vs estériles', ref: 'Richards y Kerrich (2007)', st: 'proto', tool: 'sry' },
  { id: 'vsc', g: 'fert', name: t('V/Sc vs SiO₂', 'V/Sc vs SiO₂'), axes: 'hidratación y oxidación del magma', ref: 'Loucks (2014)', st: 'proto', tool: 'vsc' },
  { id: 'layb', g: 'fert', name: t('La/Yb vs SiO₂', 'La/Yb vs SiO₂'), axes: 'profundidad de fraccionamiento', ref: 'Richards (2011)', st: 'proto', tool: 'layb' },
  { id: 'eu2', g: 'fert', name: t('Eu/Eu* (fertilidad)', 'Eu/Eu* (fertility)'), axes: 'acceso directo a Litogeoquímica', ref: 'Sun y McDonough (1989)', st: 'impl', tool: 'eu' },
  { id: 'cumo', g: 'fert', name: t('Cu vs Mo', 'Cu vs Mo'), axes: 'zonación de metales', ref: 'uso común', st: 'proto', tool: 'cumo' },
  { id: 'zce', g: 'fert', sub: ZIR, name: t('Ce⁴⁺/Ce³⁺ vs Eu/Eu* en zircón', 'Zircon Ce⁴⁺/Ce³⁺ vs Eu/Eu*'), axes: 'oxidación del magma', ref: 'Ballard et al. (2002)', st: 'prop', req: ['Ce (zircón)', 'Eu (zircón)'] },
  { id: 'lu16', g: 'fert', sub: ZIR, name: t('10000(Eu/Eu*)/Y en zircón', 'Zircon 10000(Eu/Eu*)/Y'), axes: 'fertilidad desde zircón', ref: 'Lu et al. (2016)', st: 'prop', req: ['Eu (zircón)', 'Y (zircón)'] },
  { id: 'blevin', g: 'fert', name: t('Fe₂O₃/FeO vs Rb/Sr', 'Fe₂O₃/FeO vs Rb/Sr'), axes: 'metalogenia Cu-Au, Mo, Sn-W', ref: 'Blevin (2004)', st: 'prop', req: ['Fe2O3', 'FeO', 'Rb', 'Sr'], note: t('Necesita Fe₂O₃ y FeO analizados por separado', 'Needs Fe₂O₃ and FeO analysed separately') },
  { id: 'ishi', g: 'fert', name: t('Series de magnetita e ilmenita', 'Magnetite and ilmenite series'), axes: 'Fe2O3/FeO o susceptibilidad magnética', ref: 'Ishihara (1977)', st: 'prop', req: ['Fe2O3', 'FeO'], note: t('Con susceptibilidad de Petrofísica también funciona', 'Also works with magnetic susceptibility from Petrophysics') },
  { id: 'nbta', g: 'fert', name: t('Nb/Ta vs Zr/Hf', 'Nb/Ta vs Zr/Hf'), axes: 'transición magmático-hidrotermal', ref: 'Ballouard et al. (2016)', st: 'prop', req: ['Nb', 'Ta', 'Zr', 'Hf'], plot: { kind: 'xy', x: 'Zr / Hf', y: 'Nb / Ta' } },
  { id: 'rbbasr', g: 'fert', name: t('Rb – Ba – Sr', 'Rb – Ba – Sr'), axes: 'diferenciación y potencial Sn-W', ref: 'El Bouseily y El Sokkary (1975)', st: 'prop', req: ['Rb', 'Ba', 'Sr'], plot: { kind: 'tern', a: 'Rb', b: 'Ba', c: 'Sr', la: 'Rb', lb: 'Ba', lc: 'Sr' } },

  /* ---------- Alteration & mass balance ---------- */
  { id: 'ai', g: 'alt', name: t('Índice de Ishikawa', 'Ishikawa index'), axes: '100(MgO + K2O)/(MgO + K2O + CaO + Na2O)', ref: 'Ishikawa et al. (1976)', st: 'impl', tool: 'ai' },
  { id: 'ccpi', g: 'alt', name: t('CCPI', 'CCPI'), axes: '100(MgO + FeOT)/(MgO + FeOT + Na2O + K2O)', ref: 'Large et al. (2001)', st: 'impl', tool: 'ccpi' },
  { id: 'box', g: 'alt', name: t('Alteration box plot', 'Alteration box plot'), axes: 'AI vs CCPI', ref: 'Large et al. (2001)', st: 'impl', tool: 'aiccpi' },
  { id: 'spitz', g: 'alt', name: t('Spitz–Darling', 'Spitz–Darling'), axes: 'Al2O3/Na2O', ref: 'Spitz y Darling (1978)', st: 'prop', req: ['Al2O3', 'Na2O'], plot: { kind: 'xy', x: 'SiO2', y: 'Al2O3 / Na2O' } },
  { id: 'molar', g: 'alt', name: t('Razones molares K/Al vs Na/Al', 'Molar K/Al vs Na/Al'), axes: 'feldespatos, sericita, arcillas', ref: 'Davies y Whitehead (2006)', st: 'prop', req: ['Al2O3', 'Na2O', 'K2O'], plot: { kind: 'xy', x: `${Na} / ${Al}`, y: `${K} / ${Al}` } },
  { id: 'perAlt', g: 'alt', name: t('Razones de Pearce (alteración)', 'Pearce ratios (alteration)'), axes: 'K/Ti vs Al/Ti', ref: 'Stanley y Madeisky (1994)', st: 'prop', req: ['Al2O3', 'K2O', 'TiO2'], plot: { kind: 'xy', x: `${Al} / ${Ti}`, y: `${K} / ${Ti}` } },
  { id: 'isocon', g: 'alt', name: t('Isocon', 'Isocon'), axes: 'balance de masas fresco vs alterado', ref: 'Grant (1986)', st: 'prop', needs: 'engine', note: t('Elige una muestra fresca de referencia', 'Pick a least-altered reference sample') },
  { id: 'maclean', g: 'alt', name: t('Cambio de masa con inmóvil', 'Mass change with an immobile element'), axes: 'TiO2 vs Zr (pares inmóviles)', ref: 'MacLean y Kranidiotis (1987)', st: 'prop', req: ['TiO2', 'Zr'], plot: { kind: 'xy', x: 'Zr', y: 'TiO2' } },
  { id: 'gresens', g: 'alt', name: t('Ecuaciones de Gresens', 'Gresens equations'), axes: 'ganancias y pérdidas', ref: 'Gresens (1967)', st: 'prop', needs: 'engine' },
  { id: 'ioaa', g: 'alt', name: t('Discriminación IOAA', 'IOAA discrimination'), axes: 'óxidos de Fe y alteración alcalina', ref: 'Montreuil et al. (2013)', st: 'prop', needs: 'nextPhase' },
  { id: 'cia', g: 'alt', sub: WEA, name: t('CIA', 'CIA'), axes: '100 Al2O3 / (Al2O3 + CaO + Na2O + K2O) molar', ref: 'Nesbitt y Young (1982)', st: 'prop', req: ['Al2O3', 'CaO', 'Na2O', 'K2O'], plot: { kind: 'xy', x: 'SiO2', y: `100 * ${mAl} / (${mAl} + ${mCa} + ${mNa} + ${mK})` }, note: t('Usa CaO total; falta la corrección CaO* de silicatos', 'Uses total CaO; silicate CaO* correction pending') },
  { id: 'acnkt', g: 'alt', sub: WEA, name: t('A – CN – K', 'A – CN – K'), axes: 'Al2O3 – (CaO + Na2O) – K2O molar', ref: 'Nesbitt y Young (1984)', st: 'prop', req: ['Al2O3', 'CaO', 'Na2O', 'K2O'], plot: { kind: 'tern', a: `${mCa} + ${mNa}`, b: mAl, c: mK, la: 'CN', lb: 'A', lc: 'K' } },
  { id: 'ciw', g: 'alt', sub: WEA, name: t('CIW', 'CIW'), axes: '100 Al2O3 / (Al2O3 + CaO + Na2O)', ref: 'Harnois (1988)', st: 'prop', req: ['Al2O3', 'CaO', 'Na2O'], plot: { kind: 'xy', x: 'SiO2', y: `100 * ${mAl} / (${mAl} + ${mCa} + ${mNa})` } },
  { id: 'pia', g: 'alt', sub: WEA, name: t('PIA', 'PIA'), axes: '100 (Al2O3 − K2O) / (Al2O3 + CaO + Na2O − K2O)', ref: 'Fedo et al. (1995)', st: 'prop', req: ['Al2O3', 'CaO', 'Na2O', 'K2O'], plot: { kind: 'xy', x: 'SiO2', y: `100 * (${mAl} - ${mK}) / (${mAl} + ${mCa} + ${mNa} - ${mK})` } },
  { id: 'wip', g: 'alt', sub: WEA, name: t('Índice de Parker (WIP)', 'Parker index (WIP)'), axes: 'álcalis y alcalinotérreos', ref: 'Parker (1970)', st: 'prop', req: ['Na2O', 'MgO', 'K2O', 'CaO'], plot: { kind: 'xy', x: 'SiO2', y: `100 * (2*${mNa}/0.35 + ${mMg}/0.9 + 2*${mK}/0.25 + ${mCa}/0.7)` } },

  /* ---------- Pathfinders & anomaly statistics ---------- */
  { id: 'anom', g: 'path', name: t('Anomalías por umbral', 'Threshold anomalies'), axes: 'cuantiles, cortes manuales', ref: 'uso común', st: 'proto', tool: 'anom' },
  { id: 'prob', g: 'path', name: t('Gráfico de probabilidad', 'Probability plot'), axes: 'umbrales de anomalía', ref: 'Sinclair (1974)', st: 'impl', tool: 'pctl' },
  { id: 'tukey', g: 'path', name: t('Cajas de Tukey y ECDF', 'Tukey boxes and ECDF'), axes: 'fondo y atípicos', ref: 'Tukey (1977)', st: 'impl', tool: 'hist' },
  { id: 'mad', g: 'path', name: t('Mediana ± 2 MAD', 'Median ± 2 MAD'), axes: 'fondo y umbral robustos', ref: 'Reimann et al. (2005)', st: 'prop', needs: 'engine' },
  { id: 'cafr', g: 'path', name: t('Concentración–área', 'Concentration–area'), axes: 'umbrales fractales en mapas', ref: 'Cheng et al. (1994)', st: 'prop', needs: 'engine' },
  { id: 'coda', g: 'path', name: t('Datos composicionales', 'Compositional data'), axes: 'clr · alr · ilr', ref: 'Aitchison (1986); Egozcue et al. (2003)', st: 'plan', tool: 'coda' },
  { id: 'halley', g: 'path', name: t('Huellas de pórfidos', 'Porphyry footprints'), axes: 'zonación de pathfinders', ref: 'Halley et al. (2015)', st: 'prop', req: ['Mo', 'Cu', 'As', 'Sb', 'Bi', 'Te'] },

  /* ---------- By deposit type ---------- */
  { id: 'vmsfi', g: 'models', sub: t('VMS', 'VMS'), name: t('Riolitas FI–FIV', 'FI–FIV rhyolites'), axes: 'Zr/Y vs Y', ref: 'Lesher et al. (1986); Hart et al. (2004)', st: 'prop', req: ['Zr', 'Y'], plot: { kind: 'xy', x: 'Y', y: 'Zr / Y' } },
  { id: 'vmsth', g: 'models', sub: t('VMS', 'VMS'), name: t('Th/Ta vs Yb', 'Th/Ta vs Yb'), axes: 'volcánicas félsicas', ref: 'Schandl y Gorton (2002)', st: 'prop', req: ['Th', 'Ta', 'Yb'], plot: { kind: 'xy', x: 'Yb', y: 'Th / Ta', logX: true, logY: true } },
  { id: 'lct', g: 'models', sub: t('Pegmatitas LCT', 'LCT pegmatites'), name: t('K/Rb vs Cs; Nb/Ta vs Ta', 'K/Rb vs Cs; Nb/Ta vs Ta'), axes: 'grado de fraccionamiento', ref: 'Černý (1991); Selway et al. (2005)', st: 'prop', req: ['Cs', 'Rb', 'Ta'] },
  { id: 'snw', g: 'models', sub: t('Sn-W', 'Sn-W'), name: t('Rb – Ba – Sr', 'Rb – Ba – Sr'), axes: 'granitos especializados', ref: 'El Bouseily y El Sokkary (1975)', st: 'prop', req: ['Rb', 'Ba', 'Sr'], plot: { kind: 'tern', a: 'Rb', b: 'Ba', c: 'Sr', la: 'Rb', lb: 'Ba', lc: 'Sr' } },
  { id: 'cupd', g: 'models', sub: t('Ni-Cu-EGP', 'Ni-Cu-PGE'), name: t('Cu/Pd vs Pd', 'Cu/Pd vs Pd'), axes: 'saturación en sulfuro', ref: 'Barnes et al. (1993)', st: 'prop', req: ['Cu', 'Pd'] },
  { id: 'nicu', g: 'models', sub: t('Ni-Cu-EGP', 'Ni-Cu-PGE'), name: t('Ni/Cu vs Pd/Ir', 'Ni/Cu vs Pd/Ir'), axes: 'fraccionamiento de EGP', ref: 'Barnes et al. (1988)', st: 'prop', req: ['Ni', 'Cu', 'Pd', 'Ir'] },
  { id: 'carb', g: 'models', sub: t('Carbonatitas y REE', 'Carbonatites and REE'), name: t('CaO – MgO – (FeOT + MnO)', 'CaO – MgO – (FeOT + MnO)'), axes: 'clasificación de carbonatitas', ref: 'Woolley y Kempe (1989)', st: 'prop', req: ['CaO', 'MgO', 'FeOT', 'MnO'], plot: { kind: 'tern', a: 'CaO', b: 'MgO', c: 'FeOT + MnO', la: 'CaO', lb: 'MgO', lc: 'FeOT+MnO' }, note: t('Solo aplica a carbonatitas', 'Applies to carbonatites only') },
  { id: 'iocg', g: 'models', sub: t('IOCG e IOA', 'IOCG and IOA'), name: t('Discriminación IOAA', 'IOAA discrimination'), axes: 'alteración alcalina y de óxidos de Fe', ref: 'Montreuil et al. (2013)', st: 'prop', needs: 'nextPhase' },
];

export const GROUP_NAME: Record<string, Txt> = {
  class: t('Clasificación', 'Classification'), series: t('Series magmáticas', 'Magmatic series'), alumina: t('Alúmina', 'Alumina'), variation: t('Variación', 'Variation'),
  tect: t('Discriminación tectónica', 'Tectonic discrimination'), trace: t('Trazas y normalización', 'Trace & normalization'), petro: t('Petrogénesis y termometría', 'Petrogenesis & thermometry'), build: t('Construir', 'Build'),
  fert: t('Fertilidad', 'Fertility'), alt: t('Alteración', 'Alteration'), path: t('Pathfinders', 'Pathfinders'), vector: t('Vectorización', 'Vectoring'), models: t('Modelos de depósito', 'Deposit models'),
};

export function entryAvail(e: CatEntry, cols: Column[]): Availability {
  if (e.tool && TOOLS[e.tool]) return availability(TOOLS[e.tool], cols);
  const pseudo: ToolDef = { id: e.id, label: e.name, icon: 'scatter', req: e.req, needs: e.needs, run: () => {} };
  const a = availability(pseudo, cols);
  if (a.state === 'ok' && e.st === 'prop' && !e.plot) return { state: 'partial', missing: [], reason: { es: 'Requiere el motor Python', en: 'Needs the Python engine' } };
  return a;
}

export function runEntry(e: CatEntry) {
  const s = useApp.getState();
  if (e.tool && TOOLS[e.tool]) { TOOLS[e.tool].run(); return; }
  const a = entryAvail(e, s.columns);
  if (a.state === 'off' || !e.plot) { s.notify(`${e.name[s.lang]} · ${a.missing.length ? `${s.lang === 'es' ? 'Falta' : 'Missing'}: ${a.missing.join(', ')}` : a.reason ? a.reason[s.lang] : ''}`); return; }
  const tt = { es: e.name.es, en: e.name.en };
  if (e.plot.kind === 'tern') { s.open('ternary', { tern: e.plot, cite: e.ref, status: e.st, cat: e.id, tt }, e.name.es, { w: 500, h: 460 }); return; }
  const p = e.plot;
  const b = { name: e.name[s.lang], version: 1, base: e.ref, status: e.st, x: p.x, y: p.y, logX: !!p.logX, logY: !!p.logY, fields: [], rules: (p.rules ?? []).map((r, k) => ({ id: `r${k}${Date.now()}`, ...r })) };
  s.open('builder', { cat: e.id, b, edit: false, tool: 'lasso', tt }, e.name.es, { w: 860, h: 540 });
}

// the ribbon's Pearce button now opens its catalog entry
TOOLS.pearce.run = () => runEntry(CATALOG.find(e => e.id === 'pearce84')!);
