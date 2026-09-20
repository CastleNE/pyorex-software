import { expect,it } from 'vitest';
import { dataUrlToBytes,extensionFor } from './save-file';

it('decodes base64 PNG data URLs to the original bytes',()=>{
 const bytes=dataUrlToBytes('data:image/png;base64,iVBORw0KGgo=');
 expect(Array.from(bytes)).toEqual([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
});
it('decodes percent-encoded SVG data URLs (Plotly svg output) to UTF-8 text',()=>{
 const svg='<svg xmlns="http://www.w3.org/2000/svg"><text>Fe₂O₃ 10%</text></svg>';
 const bytes=dataUrlToBytes('data:image/svg+xml,'+encodeURIComponent(svg));
 expect(new TextDecoder().decode(bytes)).toBe(svg);
});
it('rejects strings that are not data URLs',()=>{
 expect(()=>dataUrlToBytes('https://example.com/a.png')).toThrow();
});
it('maps Plotly jpeg format to .jpg',()=>{
 expect(extensionFor('jpeg')).toBe('jpg');
 expect(extensionFor('svg')).toBe('svg');
});
