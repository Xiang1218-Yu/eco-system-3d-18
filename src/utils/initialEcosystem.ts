import type { Organism } from '@/types/ecosystem';
import type { RandomStreams } from '@/utils/random';
import { createOrganism } from '@/utils/organismFactory';

/**
 * 初始群落构成（物种 -> 数量）。
 * 顺序固定：生物按此列表依次消费随机流，因此同一颗种子下
 * 初始生物的位置、速度、能量等完全一致。
 * 数量均不超过各物种的 maxPopulation。
 */
export const INITIAL_COMPOSITION: { speciesId: string; count: number }[] = [
  { speciesId: 'seaweed', count: 5 },
  { speciesId: 'grass', count: 5 },
  { speciesId: 'fish', count: 4 },
  { speciesId: 'snail', count: 2 },
  { speciesId: 'turtle', count: 1 },
  { speciesId: 'bigfish', count: 1 },
  { speciesId: 'frog', count: 2 },
  { speciesId: 'bacteria', count: 2 },
];

/** 用注入的随机流生成一整套初始生物。 */
export function createInitialOrganisms(
  streams: Pick<RandomStreams, 'experiment' | 'id'>,
): Organism[] {
  const organisms: Organism[] = [];
  for (const { speciesId, count } of INITIAL_COMPOSITION) {
    for (let i = 0; i < count; i++) {
      const organism = createOrganism(speciesId, streams);
      if (organism) organisms.push(organism);
    }
  }
  return organisms;
}
