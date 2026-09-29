import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import type { Organism } from '@/types/ecosystem';
import { useEcosystemStore } from '@/store/useEcosystemStore';
import { DEFAULT_SEED } from '@/utils/random';

function snapshotOrganism(o: Organism) {
  return {
    id: o.id,
    speciesId: o.speciesId,
    position: [o.position.x, o.position.y, o.position.z],
    velocity: [o.velocity.x, o.velocity.y, o.velocity.z],
    energy: o.energy,
    age: o.age,
    rotation: o.rotation,
    scale: o.scale,
  };
}

/** 同一套建缸操作：混合随机投放与点击定点投放。 */
function populate() {
  const store = useEcosystemStore.getState();
  store.addOrganism('seaweed');
  store.addOrganism('fish');
  store.addOrganism('fish', new THREE.Vector3(1, 0.5, -1));
  store.addOrganism('bacteria');
}

describe('生态缸 store 可复现实验', () => {
  beforeEach(() => {
    // 每个用例从已知种子与空缸开始。
    useEcosystemStore.getState().setSeed(DEFAULT_SEED);
  });

  it('相同种子重复建缸：ID、位置、速度、能量、年龄、朝向、缩放全部一致', () => {
    populate();
    const runA = useEcosystemStore.getState().organisms.map(snapshotOrganism);

    useEcosystemStore.getState().setSeed(DEFAULT_SEED);
    populate();
    const runB = useEcosystemStore.getState().organisms.map(snapshotOrganism);

    expect(runB).toEqual(runA);
    // ID 也是确定性的，重置后从 org-1 重新发号。
    expect(runB.map((o) => o.id)).toEqual(['org-1', 'org-2', 'org-3', 'org-4']);
  });

  it('不同种子建缸得到不同的初始状态，但结构相同', () => {
    populate();
    const runA = useEcosystemStore.getState().organisms.map(snapshotOrganism);

    useEcosystemStore.getState().setSeed(987654321);
    populate();
    const runB = useEcosystemStore.getState().organisms.map(snapshotOrganism);

    expect(runB).not.toEqual(runA);
    expect(runB.map((o) => o.speciesId)).toEqual(runA.map((o) => o.speciesId));
    // 定点投放的鱼位置不受种子影响，其余随机属性不同。
    const fishPlacedA = runA.find((o) => o.speciesId === 'fish' && o.position[0] === 1)!;
    const fishPlacedB = runB.find((o) => o.speciesId === 'fish' && o.position[0] === 1)!;
    expect(fishPlacedB.position).toEqual(fishPlacedA.position);
    expect(fishPlacedB.energy).not.toEqual(fishPlacedA.energy);
  });

  it('resetEcosystem 用当前种子把随机流与 ID 计数一起归零，可完整复现', () => {
    populate();
    // 推进模拟随机流若干次（模拟“已经演化过一段时间”）。
    const rngDuringRun = useEcosystemStore.getState().getRng();
    for (let i = 0; i < 50; i++) rngDuringRun.next();
    useEcosystemStore.getState().addOrganism('snail');

    useEcosystemStore.getState().resetEcosystem();
    expect(useEcosystemStore.getState().organisms).toHaveLength(0);
    expect(useEcosystemStore.getState().simulationTime).toBe(0);
    expect(useEcosystemStore.getState().seed).toBe(DEFAULT_SEED);

    populate();
    const rerun = useEcosystemStore.getState().organisms.map(snapshotOrganism);

    useEcosystemStore.getState().resetEcosystem();
    populate();
    const again = useEcosystemStore.getState().organisms.map(snapshotOrganism);

    expect(again).toEqual(rerun);
    expect(again[0].id).toBe('org-1');
  });

  it('setSeed 后种子写入状态并立即清空重置', () => {
    populate();
    useEcosystemStore.getState().setSeed(321);

    const state = useEcosystemStore.getState();
    expect(state.seed).toBe(321);
    expect(state.organisms).toHaveLength(0);
    expect(state.simulationTime).toBe(0);
    expect(state.isRunning).toBe(true);
  });

  it('setSeed 对种子做 uint32 归一化（负数取补码、小数截断）', () => {
    useEcosystemStore.getState().setSeed(-1);
    expect(useEcosystemStore.getState().seed).toBe(0xffffffff);

    useEcosystemStore.getState().setSeed(123.9);
    // Number.parseInt 语义：界面提交的是整数字符串，这里直接验证 API 容忍小数。
    expect(useEcosystemStore.getState().seed).toBe(123);
  });

  it('暂停/继续等既有交互不受种子机制影响', () => {
    const store = useEcosystemStore.getState();
    expect(store.isRunning).toBe(true);
    store.toggleSimulation();
    expect(useEcosystemStore.getState().isRunning).toBe(false);

    // 暂停时建缸仍消耗实验随机流（投放是显式用户操作，与演化抽彩互不干扰）。
    populate();
    const pausedSnapshot = useEcosystemStore.getState().organisms.map(snapshotOrganism);

    store.toggleSimulation();
    expect(useEcosystemStore.getState().isRunning).toBe(true);

    store.incrementTime();
    expect(useEcosystemStore.getState().simulationTime).toBe(1);

    // 删除/选择交互正常。
    const firstId = pausedSnapshot[0].id;
    useEcosystemStore.getState().removeOrganism(firstId);
    expect(useEcosystemStore.getState().organisms.some((o) => o.id === firstId)).toBe(false);

    useEcosystemStore.getState().toggleLabels();
    expect(useEcosystemStore.getState().showLabels).toBe(false);
  });

  it('完整演化闭环：相同种子下建缸 + 多步模拟的最终状态完全一致', async () => {
    const { simulateStep } = await import('@/utils/ecosystemSimulator');

    const run = (seed: number) => {
      const store = useEcosystemStore.getState();
      store.setSeed(seed);
      populate();

      for (let step = 0; step < 120; step++) {
        const s = useEcosystemStore.getState();
        const result = simulateStep(s.organisms, s.getRng());
        s.batchUpdateOrganisms(result.updates);
        s.batchRemoveOrganisms(result.toRemove);
        for (const { speciesId, position } of result.toAdd) {
          // 模拟 hook：出生位置已由模拟 rng 决定；store 内其余属性继续消耗实验 rng。
          s.addOrganism(speciesId, position);
        }
        s.incrementTime();
      }

      return useEcosystemStore
        .getState()
        .organisms.map(snapshotOrganism)
        .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    };

    const runA = run(2026);
    const runB = run(2026);
    const runC = run(2027);

    expect(runB).toEqual(runA);
    expect(runC).not.toEqual(runA);
  });
});
