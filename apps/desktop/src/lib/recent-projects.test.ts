import { describe, expect, it } from 'vitest';
import { RECENT_MAX, addRecent, fileOf, folderOf, removeRecent, sanitizeRecent } from './recent-projects';

describe('recent projects', () => {
  it('puts the latest first and replaces the same file, ignoring case and slash style', () => {
    let list = addRecent([], 'C:\\Proyectos\\tesis.orex', 'tesis', '1');
    list = addRecent(list, 'C:\\Proyectos\\otro.orex', 'otro', '2');
    list = addRecent(list, 'c:/proyectos/TESIS.orex', 'tesis', '3');
    expect(list.map(r => [r.name, r.at])).toEqual([['tesis', '3'], ['otro', '2']]);
  });
  it(`keeps at most ${RECENT_MAX}`, () => {
    let list = addRecent([], '/p/0.orex', '0');
    for (let i = 1; i < 12; i++) list = addRecent(list, `/p/${i}.orex`, String(i));
    expect(list).toHaveLength(RECENT_MAX);
    expect(list[0].name).toBe('11');
  });
  it('removes a file and drops malformed stored entries', () => {
    const list = addRecent(addRecent([], '/a.orex', 'a'), '/b.orex', 'b');
    expect(removeRecent(list, '/A.orex').map(r => r.name)).toEqual(['b']);
    expect(sanitizeRecent([{ path: '/x.orex', name: 'x', at: 't' }, { path: '', name: 'y', at: 't' }, 3, null])).toHaveLength(1);
    expect(sanitizeRecent('nope')).toEqual([]);
  });
  it('shows the folder of a path', () => {
    expect(folderOf('C:\\Users\\ana\\tesis.orex')).toBe('C:\\Users\\ana');
    expect(folderOf('/home/ana/tesis.orex')).toBe('/home/ana');
    expect(fileOf('C:\\Users\\ana\\tesis v2.orex')).toBe('tesis v2.orex');
    expect(fileOf('/home/ana/tesis.orex')).toBe('tesis.orex');
  });
});
