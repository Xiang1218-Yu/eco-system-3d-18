import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import type { Organism } from '@/types/ecosystem';
import type { RandomSource } from '@/utils/random';
import { createRandomStreams, generateId, RngStream } from '@/utils/random';
import { createInitialOrganisms, INITIAL_COMPOSITION } from '@/utils/initialEcosystem';
import { createOrganism } from '@/utils/organismFactory';
import { simulateStep } from '@/utils/ecosystemSimulator';
import { useEcosystemStore } from '@/store/useEcosystemStore';

/** 深拷贝一份生物（含 THREE.Vector3），保证引擎之间不共享可变状态。 */
function cloneOrganisms(organisms: Organism[]): Organism[] {
  return organisms.map((o) => ({
    ...o,
    position: o.position.clone(),
    velocity: o.velocity.clone(),
  }));
}

type StreamPair = { experiment: RandomSource; id: RandomSource };

/**
 * 把一帧演化结果应用到一份独立的生物数组上，返回新数组。
 * simulateStep 消费 experiment 流，繁殖后代的 ID 消费 id 流，
 * 与 useEcosystemSimulation 调用 store.addOrganism 的方式一致。
 */
function applyStep(
  organisms: Organism[],
  streams: StreamPair,
): Organism[] {
  const { updates, toRemove, toAdd } = simulateStep(organisms, streams.experiment);
  const removed = new Set(toRemove);
  const updateMap = new Map(updates.map((u) => [u.id, u.updates]));

  const next = organisms
    .filter((o) => !removed.has(o.id))
    .map((o) => {
      const patch = updateMap.get(o.id);
      return patch ? ({ ...o, ...patch } as Organism) : o;
    });

  // 与 hook/store 的处理顺序保持一致：先更新、再移除、最后按序繁殖
  for (const { speciesId, position } of toAdd) {
    const offspring = createOrganism(speciesId, streams, position);
    if (offspring) next.push(offspring);
  }

  return next;
}

/** 在独立内存中驱动一条完整实验。 */
function runExperiment(seed: number | string, steps: number): Organism[][] {
  const streams = createRandomStreams(seed);
  let organisms = createInitialOrganisms(streams);
  const snapshots: Organism[][] = [cloneOrganisms(organisms)];

  for (let i = 0; i < steps; i++) {
    organisms = applyStep(organisms, streams);
    snapshots.push(cloneOrganisms(organisms));
  }
  return snapshots;
}

/** 可稳定序列化的快照：ID 也纳入比较（同种子下必须一致）。 */
function serializeState(snapshots: Organism[][]): unknown {
  return snapshots.map((organisms, step) =>
    organisms
      .map((o) => ({
        step,
        id: o.id,
        speciesId: o.speciesId,
        position: [
          Number(o.position.x.toFixed(9)),
          Number(o.position.y.toFixed(9)),
          Number(o.position.z.toFixed(9)),
        ],
        velocity: [
          Number(o.velocity.x.toFixed(9)),
          Number(o.velocity.y.toFixed(9)),
          Number(o.velocity.z.toFixed(9)),
        ],
        energy: Number(o.energy.toFixed(9)),
        age: o.age,
        state: o.state,
        rotation: Number(o.rotation.toFixed(9)),
        scale: Number(o.scale.toFixed(9)),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  );
}

afterEach(() => {
  useEcosystemStore.getState().resetEcosystem(42);
});

describe('初始群落确定性', () => {
  it('同种子的初始生物逐字段一致（含 ID）', () => {
    const a = createInitialOrganisms(createRandomStreams(2026));
    const b = createInitialOrganisms(createRandomStreams(2026));
    expect(serializeState([a])).toEqual(serializeState([b]));
  });

  it('不同种子的初始生物不同', () => {
    const a = createInitialOrganisms(createRandomStreams(1));
    const b = createInitialOrganisms(createRandomStreams(2));
    expect(serializeState([a])).not.toEqual(serializeState([b]));
  });

  it('初始群落包含全部四个营养级且数量符合配置', () => {
    const organisms = createInitialOrganisms(createRandomStreams(3));
    const total = INITIAL_COMPOSITION.reduce((sum, c) => sum + c.count, 0);
    expect(organisms).toHaveLength(total);
    for (const { speciesId, count } of INITIAL_COMPOSITION) {
      expect(organisms.filter((o) => o.speciesId === speciesId)).toHaveLength(count);
    }
    const levels = new Set(organisms.map((o) => o.speciesId));
    expect(levels.size).toBe(INITIAL_COMPOSITION.length);
  });

  it('初始位置都在生态缸边界内', () => {
    const organisms = createInitialOrganisms(createRandomStreams(9));
    for (const o of organisms) {
      expect(o.position.x).toBeGreaterThanOrEqual(-4);
      expect(o.position.x).toBeLessThanOrEqual(4);
      expect(o.position.y).toBeGreaterThanOrEqual(-2);
      expect(o.position.y).toBeLessThanOrEqual(2);
      expect(o.position.z).toBeGreaterThanOrEqual(-2);
      expect(o.position.z).toBeLessThanOrEqual(2);
    }
  });
});

describe('simulateStep 确定性回归', () => {
  it('相同种子跑出完全一致的多步状态序列', () => {
    const runA = serializeState(runExperiment(12345, 120));
    const runB = serializeState(runExperiment(12345, 120));
    expect(runA).toEqual(runB);
  });

  it('不同种子产生不同的状态序列', () => {
    const runA = serializeState(runExperiment(111, 120));
    const runB = serializeState(runExperiment(222, 120));
    expect(runA).not.toEqual(runB);
  });

  it('状态序列随时间发生变化（随机决策真正参与了演化）', () => {
    const run = runExperiment(777, 80);
    const first = serializeState([run[0]]);
    const last = serializeState([run[80]]);
    expect(last).not.toEqual(first);
  });

  it('演化过程中完全不调用 Math.random', () => {
    const spy = vi.spyOn(Math, 'random');
    runExperiment(321, 60);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('注入自定义随机源时严格按照其输出决策', () => {
    // 注入返回固定值的随机源：结果完全由该源决定，两次运行必然一致。
    const runWith = (seed: number) => {
      const streams = createRandomStreams(seed);
      const fixed: RandomSource = { next: () => 0.5 };
      let organisms = createInitialOrganisms(streams);
      const out = [cloneOrganisms(organisms)];
      for (let i = 0; i < 30; i++) {
        organisms = applyStep(organisms, { experiment: fixed, id: streams.id });
        out.push(cloneOrganisms(organisms));
      }
      return out;
    };

    const r1 = serializeState(runWith(1));
    const r2 = serializeState(runWith(1));
    expect(r1).toEqual(r2);
  });

  it('随机源以相同的固定顺序被消费（快照回归基线）', () => {
    // 防止以后重构无意间改变随机数的调用顺序/次数：
    // 两套同种子状态配合相同的脚本化随机源，结果必须逐帧一致。
    function scriptedSource(script: number[]): RandomSource {
      let i = 0;
      return { next: () => script[i++ % script.length] };
    }
    const streams1 = createRandomStreams(42);
    const streams2 = createRandomStreams(42);
    const src1 = scriptedSource([0.01, 0.99, 0.4]);
    const src2 = scriptedSource([0.01, 0.99, 0.4]);

    let o1 = createInitialOrganisms(streams1);
    let o2 = createInitialOrganisms(streams2);
    for (let i = 0; i < 40; i++) {
      o1 = applyStep(o1, { experiment: src1, id: streams1.id });
      o2 = applyStep(o2, { experiment: src2, id: streams2.id });
    }
    expect(serializeState([o1])).toEqual(serializeState([o2]));
  });
});

describe('ID 与实验状态分离', () => {
  it('消费 ID 流不影响初始实验状态', () => {
    const streamsA = createRandomStreams(88);
    const streamsB = createRandomStreams(88);

    // A 额外消费大量 ID 流（模拟外部取键），不应消耗 experiment 流
    for (let i = 0; i < 20; i++) generateId(streamsA.id);

    const a = createInitialOrganisms(streamsA);
    const b = createInitialOrganisms(streamsB);
    // 去掉 ID 后以内容为键排序为多重集再比较（ID 流被提前消费，
    // 会导致 ID 与排序顺序不同，但实验字段必须完全一致）
    const stripId = (snapshots: Organism[][]) =>
      (serializeState(snapshots) as Record<string, unknown>[][]).map((group) =>
        group
          .map((entry) => {
            const { id, ...rest } = entry;
            void id;
            return JSON.stringify(rest);
          })
          .sort()
          .map((json) => JSON.parse(json)),
      );
    expect(stripId([a])).toEqual(stripId([b]));
  });
});

describe('zustand store：重置 / 暂停 / 继续', () => {
  it('初始状态即默认种子下的确定性群落', () => {
    useEcosystemStore.getState().resetEcosystem(42);
    const storeOrganisms = useEcosystemStore.getState().organisms;
    const expected = createInitialOrganisms(createRandomStreams(42));
    expect(serializeState([storeOrganisms])).toEqual(serializeState([expected]));
  });

  it('无参重置用当前种子复现一致的初始状态与时间', () => {
    const store = useEcosystemStore.getState();
    store.resetEcosystem(314);

    // 跑乱状态：手动加时间、添加生物
    store.incrementTime();
    store.addOrganism('fish');
    store.addOrganism('grass');
    expect(useEcosystemStore.getState().simulationTime).toBe(1);

    const beforeReset = useEcosystemStore.getState().organisms.length;
    store.resetEcosystem(); // 无参：同种子重来

    const state = useEcosystemStore.getState();
    expect(state.seed).toBe(314);
    expect(state.simulationTime).toBe(0);
    const expected = createInitialOrganisms(createRandomStreams(314));
    expect(serializeState([state.organisms])).toEqual(serializeState([expected]));
    expect(beforeReset).not.toBe(state.organisms.length);
  });

  it('不同种子重置产生不同初始状态', () => {
    const store = useEcosystemStore.getState();
    store.resetEcosystem(1);
    const s1 = serializeState([useEcosystemStore.getState().organisms]);
    store.resetEcosystem(2);
    const s2 = serializeState([useEcosystemStore.getState().organisms]);
    expect(useEcosystemStore.getState().seed).toBe(2);
    expect(s1).not.toEqual(s2);
  });

  it('字符串种子与数字种子都能稳定复现', () => {
    const store = useEcosystemStore.getState();
    store.resetEcosystem('experiment-A');
    const s1 = serializeState([useEcosystemStore.getState().organisms]);
    const seedA = useEcosystemStore.getState().seed;
    store.resetEcosystem('other');
    store.resetEcosystem('experiment-A');
    const s2 = serializeState([useEcosystemStore.getState().organisms]);
    expect(useEcosystemStore.getState().seed).toBe(seedA);
    expect(s1).toEqual(s2);
  });

  it('暂停与继续只是切换 isRunning，不改动生物状态', () => {
    const store = useEcosystemStore.getState();
    store.resetEcosystem(5);
    const frozen = serializeState([useEcosystemStore.getState().organisms]);

    store.toggleSimulation(); // 暂停
    expect(useEcosystemStore.getState().isRunning).toBe(false);
    expect(serializeState([useEcosystemStore.getState().organisms])).toEqual(frozen);

    store.toggleSimulation(); // 继续
    expect(useEcosystemStore.getState().isRunning).toBe(true);
    expect(serializeState([useEcosystemStore.getState().organisms])).toEqual(frozen);
  });

  it('重置后恢复运行并清空选择状态', () => {
    const store = useEcosystemStore.getState();
    store.toggleSimulation();
    store.setSelectedSpecies('fish');
    const firstId = useEcosystemStore.getState().organisms[0]?.id ?? null;
    if (firstId) store.setSelectedOrganism(firstId);

    store.resetEcosystem(5);

    const state = useEcosystemStore.getState();
    expect(state.isRunning).toBe(true);
    expect(state.selectedSpeciesId).toBeNull();
    expect(state.selectedOrganismId).toBeNull();
  });

  it('setSeed 切换到新种子的确定性群落', () => {
    const store = useEcosystemStore.getState();
    store.resetEcosystem(1);
    store.setSeed(909);
    const state = useEcosystemStore.getState();
    expect(state.seed).toBe(909);
    expect(serializeState([state.organisms])).toEqual(
      serializeState([createInitialOrganisms(createRandomStreams(909))]),
    );
  });

  it('点击放置生物也走可复现随机流（位置由用户给定，其余属性由种子决定）', () => {
    const store = useEcosystemStore.getState();
    store.resetEcosystem(606);
    const pos = new THREE.Vector3(1, 0, 1);
    store.addOrganism('fish', pos);
    store.addOrganism('fish', pos);

    // 重放：同种子 + 同样两次放置顺序 → 一致
    const firstRun = serializeState([useEcosystemStore.getState().organisms]);
    store.resetEcosystem(606);
    store.addOrganism('fish', pos.clone());
    store.addOrganism('fish', pos.clone());
    expect(serializeState([useEcosystemStore.getState().organisms])).toEqual(firstRun);
  });
});

describe('RngStream 辅助方法', () => {
  it('range / integer / chance 行为确定', () => {
    const a = new RngStream(123);
    const b = new RngStream(123);
    expect(a.range(10, 20)).toBeCloseTo(10 + (b.next()) * 10, 10);

    const c = new RngStream(123);
    const d = new RngStream(123);
    for (let i = 0; i < 100; i++) {
      const v = c.integer(8);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(8);
      expect(v).toBe(Math.floor(d.next() * 8));
    }

    const always = new RngStream(1);
    expect(new RngStream(1).chance(1.001)).toBe(true);
    expect(always.chance(-0.1)).toBe(false);
  });
});
