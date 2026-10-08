import { describe, it, expect } from 'vitest';
import { parseIslandConfig, getMachineIsland } from '../islandUtils';

describe('islandUtils', () => {
  it('parses empty or undefined text to empty array', () => {
    expect(parseIslandConfig(undefined)).toEqual([]);
    expect(parseIslandConfig('')).toEqual([]);
    expect(parseIslandConfig('   ')).toEqual([]);
  });

  it('parses "Name: Start-End" formats', () => {
    const text = 'A島: 101-120, B島: 121-140';
    const defs = parseIslandConfig(text);
    expect(defs).toHaveLength(2);
    expect(defs[0]).toEqual({ name: 'A島', startNum: 101, endNum: 120 });
    expect(defs[1]).toEqual({ name: 'B島', startNum: 121, endNum: 140 });
  });

  it('parses "Start-End: Name" formats', () => {
    const text = '101-120: メイン島\n121-150: ジャグラー島';
    const defs = parseIslandConfig(text);
    expect(defs).toHaveLength(2);
    expect(defs[0]).toEqual({ name: 'メイン島', startNum: 101, endNum: 120 });
    expect(defs[1]).toEqual({ name: 'ジャグラー島', startNum: 121, endNum: 150 });
  });

  it('correctly maps machine number to island', () => {
    const defs = [
      { name: 'A島', startNum: 101, endNum: 120 },
      { name: 'B島', startNum: 121, endNum: 140 },
    ];
    expect(getMachineIsland(105, defs)).toBe('A島');
    expect(getMachineIsland(121, defs)).toBe('B島');
    expect(getMachineIsland(140, defs)).toBe('B島');
    expect(getMachineIsland(99, defs)).toBeNull();
    expect(getMachineIsland(141, defs)).toBeNull();
  });
});
