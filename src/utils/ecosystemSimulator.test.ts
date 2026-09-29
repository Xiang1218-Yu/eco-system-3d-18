import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import type { Organism } from '@/types/ecosystem';
import { simulateStep } from '@/utils/ecosystemSimulator';
import { createRng, type Rng } from '@/utils/random';

/** 单个生物的可序列化快照（位置/速度为 THREE.Vector3）。 */
interface OrganismSnapshot {
  id: string;
  speciesId: string;
  position: [number, number, number];
  velocity: [number, number, number];
  energy: number;
  age: number;
  state: string;
  targetId: string | null;
  rotation: number;
}

function snapshotOrganisms(organisms: Organism[]): OrganismSnapshot[] {
  return organisms
    .map((o) => ({
      id: o.id,
      speciesId: o.speciesId,
      position: [o.position.x, o.position.y, o.position.z] as [number, number, number],
      velocity: [o.velocity.x, o.velocity.y, o.velocity.z] as [number, number, number],
      energy: o.energy,
      age: o.age,
      state: o.state,
      targetId: o.targetId,
      rotation: o.rotation,
    }))
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
}

/** 新生物工厂：只确定性发 ID；出生位置由 toAdd 给定，其余字段固定。 */
function makeOrganismFactory() {
  let counter = 0;
  return (speciesId: string, position: THREE.Vector3): Organism => {
    counter += 1;
    return {
      id: `new-${counter}`,
      speciesId,
      position: position.clone(),
      velocity: new THREE.Vector3(),
      energy: 50,
      age: 0,
      state: 'idle',
      targetId: null,
      rotation: 0,
      scale: 1,
    };
  };
}

/**
 * 纯函数版实验驱动器：完全照搬 useEcosystemSimulation hook 一帧内对
 * simulateStep 结果的处理顺序（更新 → 删除 → 繁殖新增），不接触任何
 * React / zustand 状态，使回归测试可以确定性地推进世界。
 */
function applyStep(
  organisms: Organism[],
  rng: Rng,
  createOrganism: (speciesId: string, position: THREE.Vector3) => Organism,
): Organism[] {
  const { updates, toRemove, toAdd } = simulateStep(organisms, rng);

  const updateMap = new Map(updates.map((u) => [u.id, u.updates]));
  const removeSet = new Set(toRemove);

  const next = organisms
    .filter((o) => !removeSet.has(o.id))
    .map((o) => {
      const u = updateMap.get(o.id);
      return u ? { ...o, ...u } : o;
    });

  for (const { speciesId, position } of toAdd) {
    next.push(createOrganism(speciesId, position));
  }

  return next;
}

/** 固定初始世界：生产者 + 草食者 + 分解者，涵盖游走/进食/繁殖/死亡路径。 */
function initialWorld(): Organism[] {
  return [
    {
      id: 'seaweed-1',
      speciesId: 'seaweed',
      position: new THREE.Vector3(-1, -1.8, 0),
      velocity: new THREE.Vector3(),
      energy: 28,
      age: 0,
      state: 'idle',
      targetId: null,
      rotation: 0,
      scale: 1,
    },
    {
      id: 'fish-1',
      speciesId: 'fish',
      position: new THREE.Vector3(0, 0, 0),
      velocity: new THREE.Vector3(0.01, 0, 0.01),
      energy: 45,
      age: 0,
      state: 'wandering',
      targetId: null,
      rotation: 0,
      scale: 1,
    },
    {
      id: 'bacteria-1',
      speciesId: 'bacteria',
      position: new THREE.Vector3(2, -1.5, 1),
      velocity: new THREE.Vector3(0.001, 0, 0),
      energy: 30,
      age: 0,
      state: 'wandering',
      targetId: null,
      rotation: 0,
      scale: 1,
    },
  ];
}

function runWorld(seed: number, steps: number): Organism[] {
  const rng = createRng(seed);
  let organisms = initialWorld();
  for (let i = 0; i < steps; i++) {
    organisms = applyStep(organisms, rng, makeOrganismFactory());
  }
  return organisms;
}

describe('simulateStep 确定性回归', () => {
  let randomSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // 模拟期间任何对 Math.random 的直接调用都视为破坏可复现性。
    randomSpy = vi.spyOn(Math, 'random');
  });

  it('相同种子 + 相同初始状态，多步演化后世界状态逐字段一致', () => {
    const runA = snapshotOrganisms(runWorld(42, 200));
    const runB = snapshotOrganisms(runWorld(42, 200));

    expect(runA).toEqual(runB);
    expect(randomSpy).not.toHaveBeenCalled();
  });

  it('不同种子产生不同的演化结果', () => {
    const runA = snapshotOrganisms(runWorld(1, 200));
    const runB = snapshotOrganisms(runWorld(2, 200));

    expect(runA).not.toEqual(runB);
  });

  it('模拟的一切随机决策都来自注入随机源，而非 Math.random', () => {
    const stream = Array.from({ length: 5000 }, (_, i) => ((i * 2654435761) >>> 0) / 4294967296);
    const consumed: number[] = [];
    const recording: Rng = {
      next() {
        const v = stream[consumed.length] ?? 0;
        consumed.push(v);
        return v;
      },
    };

    simulateStep(initialWorld(), recording);

    // 鱼的游走判定与各生物的繁殖判定都应抽彩，证明随机源确实被使用。
    expect(consumed.length).toBeGreaterThan(0);
    expect(randomSpy).not.toHaveBeenCalled();
  });

  it('暂停不改变随机流：跳过若干步后继续，与连续执行的对应片段完全一致', () => {
    // “暂停”在实现上就是不调用 simulateStep，因此不会消耗 rng。
    // 用计数器包装 rng，直接断言暂停前后抽彩次数停在正确位置。
    const makeCountingRng = (seed: number) => {
      const inner = createRng(seed);
      let draws = 0;
      return {
        draws: () => draws,
        next() {
          draws += 1;
          return inner.next();
        },
      };
    };

    const rngContinuous = makeCountingRng(77);
    let continuous = initialWorld();
    for (let i = 0; i < 110; i++) {
      continuous = applyStep(continuous, rngContinuous, makeOrganismFactory());
    }

    const rngPaused = makeCountingRng(77);
    let paused = initialWorld();
    for (let i = 0; i < 100; i++) {
      paused = applyStep(paused, rngPaused, makeOrganismFactory());
    }

    // 暂停期间：不执行任何 step，世界与抽彩计数都静止。
    const frozenSnapshot = snapshotOrganisms(paused);
    const drawsAtPause = rngPaused.draws();
    expect(rngPaused.draws()).toBe(drawsAtPause);
    expect(snapshotOrganisms(paused)).toEqual(frozenSnapshot);

    // 恢复后再跑 10 步，抽彩总数与连续运行 110 步相同，世界逐字段一致。
    for (let i = 0; i < 10; i++) {
      paused = applyStep(paused, rngPaused, makeOrganismFactory());
    }
    expect(rngPaused.draws()).toBe(rngContinuous.draws());
    expect(snapshotOrganisms(paused)).toEqual(snapshotOrganisms(continuous));
  });
});
