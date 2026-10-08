import { describe, expect, it } from 'vitest';
import { legacyTarget, useShellStore } from './shell-store';
import { translate } from '../lib/i18n';

describe('Geoquímica shell store', () => {
  it('translates legacy module deep links into an area and a view', () => {
    expect(legacyTarget('data')).toEqual({ area: 'data', view: { kind: 'data', action: 'prepare' } });
    expect(legacyTarget('diagrams')).toEqual({ area: 'data', view: { kind: 'tool', toolId: 'scatter' } });
    expect(legacyTarget('litogeochemistry')?.area).toBe('litho');
    expect(legacyTarget('mineral-exploration')?.area).toBe('explo');
    expect(legacyTarget('unknown')).toBeNull();
  });
  it('remembers the open view per area and returns to the area ribbon tab on area change', () => {
    const s = useShellStore.getState();
    s.openView({ kind: 'tool', toolId: 'qapf' }, 'litho');
    s.setRibbonTab('tool');
    s.setArea('data');
    expect(useShellStore.getState().ribbonTab).toBe('area');
    expect(useShellStore.getState().views.litho).toEqual({ kind: 'tool', toolId: 'qapf' });
  });
  it('has every shell string in both languages', () => {
    expect(translate('es', 'area.maps')).toBe('Secciones y mapas');
    expect(translate('en', 'area.maps')).toBe('Sections & Maps');
  });
});
