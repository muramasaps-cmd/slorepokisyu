import { IslandDefinition } from '../data/types';

/**
 * Parses user-configured island/zone configuration text into structured definitions.
 * Supported formats:
 * - "A島: 101-120, B島: 121-140"
 * - "101-120: メイン島 / 121-150: ジャグラー島"
 * - "101~120 (A島)\n121~140 (B島)"
 * - "101-120\n121-140" (defaults to "島1", "島2")
 */
export function parseIslandConfig(text?: string): IslandDefinition[] {
  if (!text || !text.trim()) return [];

  const lines = text
    .split(/[\n,;、/]/)
    .map((l) => l.trim())
    .filter((l) => Boolean(l));

  const definitions: IslandDefinition[] = [];

  for (const line of lines) {
    // Pattern 1: "A島: 101-120" or "A島 101-120"
    const match1 = line.match(/^([^:：0-9]+)[:：\s]+(\d+)\s*[-〜~]\s*(\d+)$/);
    if (match1) {
      const name = match1[1].trim();
      const startNum = parseInt(match1[2], 10);
      const endNum = parseInt(match1[3], 10);
      if (!isNaN(startNum) && !isNaN(endNum)) {
        definitions.push({
          name,
          startNum: Math.min(startNum, endNum),
          endNum: Math.max(startNum, endNum),
        });
        continue;
      }
    }

    // Pattern 2: "101-120: A島" or "101-120(A島)"
    const match2 = line.match(/^(\d+)\s*[-〜~]\s*(\d+)\s*[:：（\(]?\s*([^:：\)]+)[）\)]?$/);
    if (match2) {
      const startNum = parseInt(match2[1], 10);
      const endNum = parseInt(match2[2], 10);
      const name = match2[3].trim() || `島 ${startNum}-${endNum}`;
      if (!isNaN(startNum) && !isNaN(endNum)) {
        definitions.push({
          name,
          startNum: Math.min(startNum, endNum),
          endNum: Math.max(startNum, endNum),
        });
        continue;
      }
    }

    // Pattern 3: Simple "101-120" or "101~120"
    const match3 = line.match(/^(\d+)\s*[-〜~]\s*(\d+)$/);
    if (match3) {
      const startNum = parseInt(match3[1], 10);
      const endNum = parseInt(match3[2], 10);
      if (!isNaN(startNum) && !isNaN(endNum)) {
        const minN = Math.min(startNum, endNum);
        const maxN = Math.max(startNum, endNum);
        definitions.push({
          name: `${minN}〜${maxN}番台`,
          startNum: minN,
          endNum: maxN,
        });
        continue;
      }
    }
  }

  return definitions;
}

/**
 * Finds which island a machine belongs to based on definitions.
 */
export function getMachineIsland(
  machineNum: number,
  definitions: IslandDefinition[]
): string | null {
  if (!definitions || definitions.length === 0) return null;
  for (const def of definitions) {
    if (machineNum >= def.startNum && machineNum <= def.endNum) {
      return def.name;
    }
  }
  return null;
}
