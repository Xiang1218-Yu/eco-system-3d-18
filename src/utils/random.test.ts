import { describe, it, expect } from 'vitest';
import {
  chance,
  createIdFactory,
  createRng,
  DEFAULT_SEED,
  range,
  uiRng,
} from '@/utils/random';

describe('createRng (mulberry32)', () => {
  it('相同种子产出完全一致的随机序列', () => {
    const a = createRng(12345);
    const b = createRng(12345);

    const seqA = Array.from({ length: 1000 }, () => a.next());
    const seqB = Array.from({ length: 1000 }, () => b.next());

    expect(seqA).toEqual(seqB);
  });

  it('不同种子产出不同的随机序列', () => {
    const a = createRng(1);
    const b = createRng(2);

    const seqA = Array.from({ length: 100 }, () => a.next());
    const seqB = Array.from({ length: 100 }, () => b.next());

    expect(seqA).not.toEqual(seqB);
  });

  it('产出落在 [0, 1) 区间', () => {
    const rng = createRng(DEFAULT_SEED);
    for (let i = 0; i < 10000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('种子按 uint32 归一化（负数/小数与等值正种子一致）', () => {
    const r1 = createRng(-1);
    const r2 = createRng(0xffffffff);
    expect(r1.next()).toBe(r2.next());
  });

  it('range 与 chance 使用注入的随机源', () => {
    const fixed = createRng(7);
    const r1 = range(fixed, 10, 20);
    const fixed2 = createRng(7);
    const r2 = 10 + fixed2.next() * 10;
    expect(r1).toBe(r2);
    expect(r1).toBeGreaterThanOrEqual(10);
    expect(r1).toBeLessThan(20);

    const always = { next: () => 0 };
    const never = { next: () => 0.999 };
    expect(chance(always, 0.5)).toBe(true);
    expect(chance(never, 0.5)).toBe(false);
  });
});

describe('createIdFactory', () => {
  it('生成确定性、唯一且有序的 ID', () => {
    const f = createIdFactory('org');
    expect([f.next(), f.next(), f.next()]).toEqual(['org-1', 'org-2', 'org-3']);
  });

  it('reset 后序列从头开始，两个重置实例产出相同 ID 序列', () => {
    const a = createIdFactory();
    a.next();
    a.next();
    a.reset();

    const b = createIdFactory();
    expect([a.next(), a.next()]).toEqual([b.next(), b.next()]);
  });
});

describe('uiRng', () => {
  it('始终产出 [0, 1) 数值，与实验 PRNG 解耦', () => {
    for (let i = 0; i < 50; i++) {
      const v = uiRng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
