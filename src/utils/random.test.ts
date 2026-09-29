import { describe, expect, it, vi } from 'vitest';
import {
  createRandomStreams,
  generateId,
  hashSeed,
  mulberry32,
  normalizeSeed,
  renderRandom,
  RngStream,
} from '@/utils/random';

describe('mulberry32', () => {
  it('相同种子产生相同序列', () => {
    const a = mulberry32(123);
    const b = mulberry32(123);
    const seqA = Array.from({ length: 100 }, () => a());
    const seqB = Array.from({ length: 100 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('不同种子产生不同序列', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    const seqA = Array.from({ length: 50 }, () => a());
    const seqB = Array.from({ length: 50 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });

  it('输出落在 [0, 1) 区间', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('无符号 32 位回绕也能保持确定性', () => {
    const a = mulberry32(0xffffffff);
    const b = mulberry32(0xffffffff);
    expect(a()).toBe(b());
  });
});

describe('normalizeSeed / hashSeed', () => {
  it('数字种子归一化为 uint32', () => {
    expect(normalizeSeed(42)).toBe(42);
    expect(normalizeSeed(42.9)).toBe(42);
    expect(normalizeSeed(0x100000000 + 5)).toBe(5);
  });

  it('相同字符串种子归一化结果一致，不同字符串不同', () => {
    expect(normalizeSeed('eco-01')).toBe(hashSeed('eco-01'));
    expect(normalizeSeed('eco-01')).toBe(normalizeSeed('eco-01'));
    expect(normalizeSeed('eco-01')).not.toBe(normalizeSeed('eco-02'));
  });
});

describe('createRandomStreams', () => {
  it('同种子的各随机流序列完全一致', () => {
    const s1 = createRandomStreams(99);
    const s2 = createRandomStreams(99);
    expect(s1.seed).toBe(s2.seed);
    const n = 100;
    const take = (stream: RngStream) => Array.from({ length: n }, () => stream.next());
    expect(take(s1.experiment)).toEqual(take(s2.experiment));
    expect(take(s1.id)).toEqual(take(s2.id));
    expect(take(s1.render)).toEqual(take(s2.render));
  });

  it('不同种子产生不同实验序列', () => {
    const s1 = createRandomStreams(1);
    const s2 = createRandomStreams(2);
    const seq1 = Array.from({ length: 50 }, () => s1.experiment.next());
    const seq2 = Array.from({ length: 50 }, () => s2.experiment.next());
    expect(seq1).not.toEqual(seq2);
  });

  it('experiment / id / render 三条流彼此独立', () => {
    const baseline = createRandomStreams(555);
    const expected = Array.from({ length: 30 }, () => baseline.experiment.next());

    // 大量消费 id 与 render 流，不应影响 experiment 序列
    const probed = createRandomStreams(555);
    for (let i = 0; i < 1000; i++) {
      probed.id.next();
      probed.render.next();
    }
    const actual = Array.from({ length: 30 }, () => probed.experiment.next());
    expect(actual).toEqual(expected);
  });

  it('渲染装饰流的消费不会改变实验流', () => {
    const before = Array.from({ length: 10 }, () =>
      createRandomStreams(2024).experiment.next(),
    );
    for (let i = 0; i < 500; i++) renderRandom.next();
    const after = Array.from({ length: 10 }, () =>
      createRandomStreams(2024).experiment.next(),
    );
    expect(before).toEqual(after);
  });
});

describe('generateId', () => {
  it('生成 9 位 base36 标识且同种子可复现', () => {
    const s1 = createRandomStreams(7);
    const s2 = createRandomStreams(7);
    const id1 = generateId(s1.id);
    const id2 = generateId(s2.id);
    expect(id1).toBe(id2);
    expect(id1).toMatch(/^[0-9a-z]{9}$/);
  });

  it('不调用 Math.random', () => {
    const spy = vi.spyOn(Math, 'random');
    generateId(createRandomStreams(1).id);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
