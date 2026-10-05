import { describe, expect, it } from 'vitest';
import { nextEnabled, findOption } from './select-options';
const options = [{value:'a',label:'Alpha'}, {value:'b',label:'Beta',disabled:true}, {value:'c',label:'Charlie'}, {value:'d',label:'Chocolate'}];
describe('custom selector keyboard navigation', () => {
  it('skips disabled options and wraps in both directions', () => {
    expect(nextEnabled(options,0,1)).toBe(2);
    expect(nextEnabled(options,0,-1)).toBe(3);
    expect(nextEnabled(options,3,1)).toBe(0);
  });
  it('handles empty and fully disabled lists', () => {
    expect(nextEnabled([],0,1)).toBe(-1);
    expect(nextEnabled(options.map(option=>({...option,disabled:true})),0,-1)).toBe(-1);
  });
  it('finds names case-insensitively without selecting disabled options', () => {
    expect(findOption(options,'ch',0)).toBe(2);
    expect(findOption(options,'C',2)).toBe(3);
    expect(findOption(options,'b',0)).toBe(-1);
    expect(findOption(options,'missing',0)).toBe(-1);
  });
});
