import { expect,it } from 'vitest';
import { attributeKey,resolveAttribute } from './geochemistry-attributes';
import { guessMapping,type GeoTool } from './geochemistry-api';
it('isolates identical category labels in different columns',()=>{
 const styles={[attributeKey('Lithology','A')]:{color:'#ff0000',visible:false}};
 expect(resolveAttribute(styles,'Lithology','A',0,7,'circle').visible).toBe(false);
 expect(resolveAttribute(styles,'Region','A',0,7,'circle').visible).toBe(true);
});
it('retains global defaults for categories without overrides',()=>{
 expect(resolveAttribute({},null,'All',0,12,'square')).toMatchObject({size:12,symbol:'square',visible:true});
});
it('assigns distinct numeric columns to generic XY axes',()=>{
 const tool={inputs:['X','Y'],unit:'raw'} as GeoTool;
 expect(guessMapping(tool,[{name:'Sample',numeric:false},{name:'Cu',numeric:true},{name:'Zn',numeric:true}])).toEqual({X:'Cu',Y:'Zn'});
});
