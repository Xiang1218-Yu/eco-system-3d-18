/**
 * 可注入的随机源。
 *
 * 生态模拟的所有随机决策都必须走这里的 RNG，而不是直接调用 Math.random，
 * 这样给定相同种子就能复现完全一致的实验状态序列。
 *
 * 三类随机流彼此独立、互不消耗对方的随机数：
 * - experiment：实验逻辑（初始生物属性、游走、繁殖、捕食相关决策）
 * - id：仅用于生成生物 ID，ID 不参与实验状态的比较与演化
 * - render：仅用于渲染装饰（沙粒、气泡等），不影响模拟结果
 */

export interface RandomSource {
  /** 返回 [0, 1) 区间的伪随机数 */
  next(): number;
}

/** 默认实验种子，未显式设置时使用 */
export const DEFAULT_SEED = 42;

/**
 * mulberry32 伪随机数生成器。
 * 纯整数运算、无平台依赖，Node 与浏览器中结果完全一致。
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function nextRandom() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 将任意字符串（含数字种子）混合为一个 uint32 种子 */
export function hashSeed(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  h = Math.imul(h, 3266489909);
  h ^= h >>> 16;
  return h >>> 0;
}

/** 把任意输入归一化为 uint32 种子 */
export function normalizeSeed(seed: number | string): number {
  if (typeof seed === 'number' && Number.isFinite(seed)) return seed >>> 0;
  return hashSeed(String(seed));
}

/** 带常用辅助方法的随机流，实现 RandomSource 接口，可被自定义实现替换 */
export class RngStream implements RandomSource {
  private readonly generate: () => number;

  constructor(seed: number) {
    this.generate = mulberry32(seed >>> 0);
  }

  next(): number {
    return this.generate();
  }

  /** [min, max) 区间的均匀随机数 */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** [0, maxExclusive) 区间的随机整数 */
  integer(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }

  /** 以 probability 的概率返回 true */
  chance(probability: number): boolean {
    return this.next() < probability;
  }
}

export interface RandomStreams {
  seed: number;
  /** 实验逻辑随机流：初始生物、游走、繁殖及其他模拟决策 */
  experiment: RngStream;
  /** ID 随机流：与实验状态无关 */
  id: RngStream;
  /** 渲染装饰随机流：与实验状态无关 */
  render: RngStream;
}

/**
 * 由同一个用户种子派生出三条相互独立的随机流。
 * 相同种子必定构造出相同序列，不同种子（极高概率）产生不同序列。
 */
export function createRandomStreams(seed: number | string): RandomStreams {
  const normalized = normalizeSeed(seed);
  return {
    seed: normalized,
    experiment: new RngStream(hashSeed(`${normalized}:experiment`)),
    id: new RngStream(hashSeed(`${normalized}:id`)),
    render: new RngStream(hashSeed(`${normalized}:render`)),
  };
}

/**
 * 仅用于渲染装饰的全局随机流。
 * 它独立于实验流，因此气泡、沙粒等装饰永远不会扰动可复现的模拟结果，
 * 重置实验也不会改变装饰随机数的消费进度。
 */
export const renderRandom: RandomSource = new RngStream(
  hashSeed('aquarium-render-decoration'),
);

/** 用 ID 随机流生成一个 9 位 base36 标识，格式与历史实现保持一致 */
export function generateId(rng: RandomSource): string {
  const partA = rng.next().toString(36).slice(2);
  const partB = rng.next().toString(36).slice(2);
  return (partA + partB).slice(0, 9).padEnd(9, '0');
}
