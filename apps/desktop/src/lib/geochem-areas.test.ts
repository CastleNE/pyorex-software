import { describe, expect, it } from 'vitest';
import registryFixture from './fixtures/geochemistry-registry.json?raw';
import type { GeoRegistry } from './geochemistry-api';
import { AREAS, DEFAULT_VIEW, RIBBON_GROUPS, VIEW_ITEMS, areaOfTool, inputsCovered, placeTool, ribbonFor } from './geochem-areas';

const REGISTRY = JSON.parse(registryFixture) as GeoRegistry;
const implemented = REGISTRY.tools.filter(t => t.status === 'implemented');
const toolIds = (area: (typeof AREAS)[number]) => ribbonFor(area, REGISTRY).flatMap(g => g.items).filter(i => i.kind === 'tool').map(i => (i.kind === 'tool' ? i.toolId : ''));

describe('Geoquímica areas over the canonical registry', () => {
  it('places every implemented registry tool exactly once', () => {
    const all = AREAS.flatMap(toolIds);
    expect(all.sort()).toEqual(implemented.map(t => t.id).sort());
    expect(new Set(all).size).toBe(all.length);
  });
  it('keeps registry modules in their area: diagrams and data_analysis → Data & Analysis', () => {
    for (const t of implemented.filter(t => t.module === 'diagrams' || t.module === 'data_analysis')) expect(areaOfTool(t)).toBe('data');
    for (const t of implemented.filter(t => t.module === 'lithogeochemistry')) expect(areaOfTool(t)).toBe('litho');
    for (const t of implemented.filter(t => t.module === 'exploration')) expect(areaOfTool(t)).toBe('explo');
  });
  it('puts fertility ratios in Mineral Exploration and the classic diagrams in Lithogeochemistry', () => {
    expect(toolIds('explo')).toEqual(expect.arrayContaining(['fertility-sr-y', 'fertility-la-yb', 'fertility-dy-yb', 'alteration']));
    expect(toolIds('litho')).toEqual(expect.arrayContaining(['tas', 'qapf', 'afm', 'k2o-sio2', 'harker', 'ree-normalization', 'shand-index']));
    expect(toolIds('litho')).not.toContain('fertility-sr-y');
  });
  it('never renames canonical module/family values', () => {
    expect(placeTool({ module: 'lithogeochemistry', family: 'classification' })).toBe('class');
    expect(placeTool({ module: 'diagrams', family: 'brand_new_family' })).toBe('charts');      // unknown family still shown
    expect(placeTool({ module: 'unknown_module', family: 'x' })).toBeNull();
  });
  it('only lists workspace views that exist, each in a known group', () => {
    for (const v of VIEW_ITEMS) expect(RIBBON_GROUPS.some(g => g.id === v.group)).toBe(true);
    expect(ribbonFor('maps', REGISTRY).flatMap(g => g.items).map(i => i.key)).toEqual(['view:sample-map']);
  });
  it('defaults each area to a tool or view that exists', () => {
    for (const a of AREAS) { const v = DEFAULT_VIEW[a]; if (v.kind === 'tool') expect(implemented.some(t => t.id === v.toolId)).toBe(true); }
  });
  it('reports which declared inputs have no compatible column', () => {
    const tas = implemented.find(t => t.id === 'tas')!;
    expect(inputsCovered(tas, () => true)).toEqual({ ok: true, missing: [] });
    const none = inputsCovered(tas, () => false);
    expect(none.ok).toBe(tas.inputs.every(i => !i.allowed_roles.length && !i.allowed_analytes.length));
  });
});
