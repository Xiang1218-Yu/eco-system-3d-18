/**
 * 可复现实验的随机源基础设施。
 *
 * 三类随机需求严格分开：
 * 1. 模拟随机（createRng）：初始生物属性、位置、速度、游走、繁殖以及
 *    simulateStep 内的一切随机决策，使用带种子的确定性 PRNG，可注入、可复现。
 * 2. 生物 ID（createIdFactory）：确定性自增计数器，不消耗模拟随机流，
 *    重置种子后计数器归零，保证同种子运行连 ID 序列都一致。
 * 3. 渲染/界面随机（uiRng）：沙粒、气泡等纯装饰用途以及用户主动摇种子等
 *    不需要复现的场景，直接走 Math.random，绝不影响实验状态序列。
 */

export interface Rng {
  /** 返回 [0, 1) 区间的伪随机数。 */
  next(): number;
}

/** 应用默认种子；未手动设置时所有实验都从它开始。 */
export const DEFAULT_SEED = 42;

/**
 * mulberry32：小巧、确定、跨平台一致（纯整数运算 + 一次浮点除法），
 * 足以驱动生态模拟。
 */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return {
    next() {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

/** [min, max) 区间均匀采样。 */
export function range(rng: Rng, min: number, max: number): number {
  return min + rng.next() * (max - min);
}

/** 以概率 p 返回 true。 */
export function chance(rng: Rng, p: number): boolean {
  return rng.next() < p;
}

/**
 * 与实验复现无关的随机源：渲染装饰（沙粒、气泡）和用户界面的一次性
 * 随机（如“摇一个新种子”）使用它，避免与模拟随机流相互污染。
 */
export const uiRng: Rng = {
  next: () => Math.random(),
};

export interface IdFactory {
  next(): string;
  reset(): void;
}

/** 确定性自增 ID 工厂；reset 后序列从头开始。 */
export function createIdFactory(prefix = 'org'): IdFactory {
  let count = 0;
  return {
    next() {
      count += 1;
      return `${prefix}-${count}`;
    },
    reset() {
      count = 0;
    },
  };
}
