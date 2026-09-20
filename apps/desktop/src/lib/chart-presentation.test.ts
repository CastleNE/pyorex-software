import { expect,it } from 'vitest';
import { displaySizes,axisRange } from './chart-presentation';
it('handles automatic size classes and missing values without dropping samples',()=>{
 expect(displaySizes([1,2,3,4,5,6,null],'quantile',7)).toEqual([5,5,10,10,16,16,7]);
 expect(displaySizes([2,2,null],'linear',7)).toEqual([7,7,7]);
});
it('converts user log bounds to Plotly exponents and rejects invalid limits',()=>{
 expect(axisRange('1','1000',true)).toEqual([0,3]);
 expect(axisRange('0','10',true)).toBeUndefined();
 expect(axisRange('9','2',false)).toBeUndefined();
 expect(axisRange('','10',false)).toBeUndefined();
});
