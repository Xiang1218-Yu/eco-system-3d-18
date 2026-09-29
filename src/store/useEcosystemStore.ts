import { create } from 'zustand';
import * as THREE from 'three';
import type { Organism, EcosystemStats, Species } from '@/types/ecosystem';
import { getSpeciesById, SPECIES } from '@/data/species';
import {
  createIdFactory,
  createRng,
  DEFAULT_SEED,
  range,
  type IdFactory,
  type Rng,
} from '@/utils/random';

interface EcosystemStore {
  organisms: Organism[];
  selectedSpeciesId: string | null;
  selectedOrganismId: string | null;
  isRunning: boolean;
  simulationTime: number;
  showLabels: boolean;
  /** 当前实验种子；相同种子重置后产生完全一致的状态序列。 */
  seed: number;

  addOrganism: (speciesId: string, position?: THREE.Vector3) => void;
  removeOrganism: (organismId: string) => void;
  updateOrganism: (organismId: string, updates: Partial<Organism>) => void;
  setSelectedSpecies: (speciesId: string | null) => void;
  setSelectedOrganism: (organismId: string | null) => void;
  toggleSimulation: () => void;
  incrementTime: () => void;
  resetEcosystem: () => void;
  /** 设置新种子并立即以该种子重置实验。 */
  setSeed: (seed: number) => void;
  toggleLabels: () => void;
  getStats: () => EcosystemStats;
  /** 模拟循环使用的可注入随机源（不放响应式状态，避免无谓渲染）。 */
  getRng: () => Rng;
  batchUpdateOrganisms: (updates: { id: string; updates: Partial<Organism> }[]) => void;
  batchRemoveOrganisms: (ids: string[]) => void;
}

const AQUARIUM_BOUNDS = {
  minX: -4,
  maxX: 4,
  minY: -2,
  maxY: 2,
  minZ: -2,
  maxZ: 2,
};

// 模拟随机源与确定性 ID 工厂都是模块级可变实例：属于实验执行状态而非 UI
// 状态，因此不放进 zustand 响应式数据里。
let simulationRng: Rng = createRng(DEFAULT_SEED);
const organismIdFactory: IdFactory = createIdFactory();

function randomPosition(rng: Rng, species: Species): THREE.Vector3 {
  const isProducer = species.trophicLevel === 'producer';
  const minY = isProducer ? AQUARIUM_BOUNDS.minY : AQUARIUM_BOUNDS.minY + 0.3;
  const maxY = isProducer ? AQUARIUM_BOUNDS.minY + 0.5 : AQUARIUM_BOUNDS.maxY - 0.3;

  return new THREE.Vector3(
    range(rng, AQUARIUM_BOUNDS.minX, AQUARIUM_BOUNDS.maxX),
    range(rng, minY, maxY),
    range(rng, AQUARIUM_BOUNDS.minZ, AQUARIUM_BOUNDS.maxZ),
  );
}

function createOrganism(rng: Rng, speciesId: string, position?: THREE.Vector3): Organism | null {
  const species = getSpeciesById(speciesId);
  if (!species) return null;

  const pos = position ? position.clone() : randomPosition(rng, species);

  return {
    id: organismIdFactory.next(),
    speciesId,
    position: pos,
    velocity: new THREE.Vector3(
      range(rng, -0.5, 0.5) * species.speed,
      range(rng, -0.5, 0.5) * species.speed * 0.5,
      range(rng, -0.5, 0.5) * species.speed,
    ),
    energy: species.energyValue * range(rng, 0.7, 1),
    age: rng.next() * species.lifespan * 0.3,
    state: 'idle',
    targetId: null,
    rotation: rng.next() * Math.PI * 2,
    scale: range(rng, 0.8, 1.2),
  };
}

/** 以指定种子重启实验随机流：重置 PRNG 与 ID 计数器。 */
function reseed(seed: number) {
  simulationRng = createRng(seed >>> 0);
  organismIdFactory.reset();
}

export const useEcosystemStore = create<EcosystemStore>((set, get) => ({
  organisms: [],
  selectedSpeciesId: null,
  selectedOrganismId: null,
  isRunning: true,
  simulationTime: 0,
  showLabels: true,
  seed: DEFAULT_SEED,

  addOrganism: (speciesId, position) => {
    const state = get();
    const species = getSpeciesById(speciesId);
    if (!species) return;

    const currentCount = state.organisms.filter((o) => o.speciesId === speciesId).length;
    if (currentCount >= species.maxPopulation) return;

    const organism = createOrganism(simulationRng, speciesId, position);
    if (organism) {
      set((prev) => ({ organisms: [...prev.organisms, organism] }));
    }
  },

  removeOrganism: (organismId) => {
    set((prev) => ({
      organisms: prev.organisms.filter((o) => o.id !== organismId),
      selectedOrganismId: prev.selectedOrganismId === organismId ? null : prev.selectedOrganismId,
    }));
  },

  updateOrganism: (organismId, updates) => {
    set((prev) => ({
      organisms: prev.organisms.map((o) => (o.id === organismId ? { ...o, ...updates } : o)),
    }));
  },

  batchUpdateOrganisms: (updates) => {
    set((prev) => {
      const updateMap = new Map(updates.map((u) => [u.id, u.updates]));
      return {
        organisms: prev.organisms.map((o) => {
          const update = updateMap.get(o.id);
          return update ? { ...o, ...update } : o;
        }),
      };
    });
  },

  batchRemoveOrganisms: (ids) => {
    const idSet = new Set(ids);
    set((prev) => ({
      organisms: prev.organisms.filter((o) => !idSet.has(o.id)),
      selectedOrganismId:
        prev.selectedOrganismId && idSet.has(prev.selectedOrganismId) ? null : prev.selectedOrganismId,
    }));
  },

  setSelectedSpecies: (speciesId) => {
    set({ selectedSpeciesId: speciesId });
  },

  setSelectedOrganism: (organismId) => {
    set({ selectedOrganismId: organismId });
  },

  toggleSimulation: () => {
    set((prev) => ({ isRunning: !prev.isRunning }));
  },

  incrementTime: () => {
    set((prev) => ({ simulationTime: prev.simulationTime + 1 }));
  },

  resetEcosystem: () => {
    // 用当前种子重置整个实验：清空生物、随机流与 ID 计数回到起点，
    // 从而能完整复现这颗种子的状态序列。
    reseed(get().seed);
    set({
      organisms: [],
      selectedSpeciesId: null,
      selectedOrganismId: null,
      simulationTime: 0,
      isRunning: true,
    });
  },

  setSeed: (seed) => {
    const normalized = seed >>> 0;
    reseed(normalized);
    set({
      seed: normalized,
      organisms: [],
      selectedSpeciesId: null,
      selectedOrganismId: null,
      simulationTime: 0,
      isRunning: true,
    });
  },

  toggleLabels: () => {
    set((prev) => ({ showLabels: !prev.showLabels }));
  },

  getRng: () => simulationRng,

  getStats: () => {
    const state = get();
    const populationBySpecies: Record<string, number> = {};
    SPECIES.forEach((s) => {
      populationBySpecies[s.id] = 0;
    });
    state.organisms.forEach((o) => {
      populationBySpecies[o.speciesId] = (populationBySpecies[o.speciesId] || 0) + 1;
    });

    let balanceIndex = 0;
    const levels = ['producer', 'herbivore', 'carnivore', 'decomposer'];
    const levelCounts: Record<string, number> = { producer: 0, herbivore: 0, carnivore: 0, decomposer: 0 };
    state.organisms.forEach((o) => {
      const sp = getSpeciesById(o.speciesId);
      if (sp) levelCounts[sp.trophicLevel]++;
    });

    const total = state.organisms.length;
    if (total > 0) {
      const idealRatios = { producer: 0.5, herbivore: 0.3, carnivore: 0.1, decomposer: 0.1 };
      let deviation = 0;
      levels.forEach((level) => {
        const actual = levelCounts[level] / total;
        deviation += Math.abs(actual - idealRatios[level]);
      });
      balanceIndex = Math.max(0, 100 - deviation * 100);
    }

    return {
      time: state.simulationTime,
      isRunning: state.isRunning,
      balanceIndex,
      populationBySpecies,
      totalOrganisms: total,
    };
  },
}));

export { AQUARIUM_BOUNDS };
