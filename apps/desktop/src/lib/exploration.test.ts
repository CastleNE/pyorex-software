import { expect,it } from 'vitest';
import { parseBreaks } from './exploration-api';
import { useAppStore } from '../stores/app-store';

it('accepts decimal commas and custom increasing thresholds',()=>{
  expect(parseBreaks('0,1; 0,5; 1')).toEqual([.1,.5,1]);
});
it('rejects blank, duplicated, unordered and nonfinite cuts',()=>{
  for(const input of ['1;;3','2;1','1;1','1;Infinity'])expect(()=>parseBreaks(input)).toThrow();
});
it('routes legacy Data requests into Geochemistry rather than a fourth module',()=>{
  useAppStore.getState().setActiveNav('data');
  expect(useAppStore.getState().activeNav).toBe('geochemistry');
  expect(useAppStore.getState().activeModuleId).toBe('data');
});
