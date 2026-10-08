import { describe, expect, it } from 'vitest';
import { BUILTIN_BIN_RANGES, allBinRanges, useBinRangesStore } from './bin-ranges-store';
import { percentilesProblem } from '../lib/size-classes';

describe('saved class ranges (bin ranges)', () => {
  it('ships valid built-in percentile ranges', () => {
    for (const r of BUILTIN_BIN_RANGES) expect(percentilesProblem(r.breaks)).toBeNull();
  });
  it('saves, replaces by name and type, and removes user ranges', () => {
    const s = useBinRangesStore.getState();
    expect(s.save('Cu umbrales', 'value', [50, 100, 200, 500], 'ppm')).toBeTruthy();
    expect(s.save('  ', 'value', [1, 2])).toBeNull();
    expect(s.save('Malo', 'percentile', [0, 50])).toBeNull();
    const id = useBinRangesStore.getState().save('cu UMBRALES', 'value', [50, 150, 400], 'ppm');
    const ranges = useBinRangesStore.getState().ranges;
    expect(ranges).toHaveLength(1);
    expect(ranges[0]).toMatchObject({ id, name: 'cu UMBRALES', type: 'value', breaks: [50, 150, 400], unit: 'ppm' });
    expect(allBinRanges(ranges)).toHaveLength(BUILTIN_BIN_RANGES.length + 1);
    useBinRangesStore.getState().remove(id!);
    expect(useBinRangesStore.getState().ranges).toHaveLength(0);
  });
});
