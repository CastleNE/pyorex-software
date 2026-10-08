import { describe, expect, it } from 'vitest';
import { hasFeature, hasModule, type Plan } from './plan-store';

const demo: Plan = { plan: 'demo', label: 'PyOreX Demo', modules: ['geochemistry'], features: [], max_rows: 500 };
describe('plan gates in the interface', () => {
  it('reflects the engine plan and locks nothing while it is unknown', () => {
    expect([hasModule(demo, 'geochemistry'), hasModule(demo, 'spectrometry'), hasFeature(demo, 'projects')]).toEqual([true, false, false]);
    expect([hasModule(null, 'spectrometry'), hasFeature(null, 'projects')]).toEqual([true, true]);
  });
});
