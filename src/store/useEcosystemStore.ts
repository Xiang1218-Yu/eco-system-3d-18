import { create } from 'zustand';
import * as THREE from 'three';
import type { Organism, EcosystemStats } from '@/types/ecosystem';
import { getSpeciesById, SPECIES } from '@/data/species';
import { AQUARIUM_BOUNDS } from '@/constants/aquarium';
import { createOrganism } from '@/utils/organismFactory';
import { createInitialOrganisms } from '@/utils/initialEcosystem';
import { createRandomStreams, DEFAULT_SEED, type RandomStreams } from '@/utils/random';

interface EcosystemStore {
  organisms: Organism[];
  selectedSpeciesId: string | null;
  selectedOrganismId: string | null;
  isRunning: boolean;
  simulationTime: number;
  showLabels: boolean;
  /** 当前实验种子（uint32） */
  seed: number;
  /** 由当前种子派生的随机流（experiment / id / render 彼此独立） */
  randomStreams: RandomStreams;

  addOrganism: (speciesId: string, position?: THREE.Vector3) => void;
  removeOrganism: (organismId: string) => void;
  updateOrganism: (organismId: string, updates: Partial<Organism>) => void;
  setSelectedSpecies: (speciesId: string | null) => void;
  setSelectedOrganism: (organismId: string | null) => void;
  toggleSimulation: () => void;
  incrementTime: () => void;
  /**
   * 重置生态缸。
   * 不传参时用当前种子重新派生随机流（可复现同一条状态序列）；
   * 传入新种子时切换种子并重新开始。
   */
  resetEcosystem: (seed?: number | string) => void;
  /** 切换实验种子：重新派生随机流并生成该种子下的初始群落 */
  setSeed: (seed: number | string) => void;
  toggleLabels: () => void;
  getStats: () => EcosystemStats;
  batchUpdateOrganisms: (updates: { id: string; updates: Partial<Organism> }[]) => void;
  batchRemoveOrganisms: (ids: string[]) => void;
}

/**
 * 由种子构造一份全新的随机状态：重新派生随机流并生成初始群落。
 * 同一种子多次调用会得到逐字段一致的初始生物。
 */
function createSeededState(seed: number | string): Pick<
  EcosystemStore,
  'organisms' | 'seed' | 'randomStreams'
> {
  const randomStreams = createRandomStreams(seed);
  return {
    organisms: createInitialOrganisms(randomStreams),
    seed: randomStreams.seed,
    randomStreams,
  };
}

export const useEcosystemStore = create<EcosystemStore>((set, get) => ({
  ...createSeededState(DEFAULT_SEED),
  selectedSpeciesId: null,
  selectedOrganismId: null,
  isRunning: true,
  simulationTime: 0,
  showLabels: true,

  addOrganism: (speciesId, position) => {
    const state = get();
    const species = getSpeciesById(speciesId);
    if (!species) return;

    const currentCount = state.organisms.filter((o) => o.speciesId === speciesId).length;
    if (currentCount >= species.maxPopulation) return;

    const organism = createOrganism(
      speciesId,
      state.randomStreams,
      position,
    );
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

  resetEcosystem: (seed) => {
    set((prev) => ({
      ...createSeededState(seed === undefined ? prev.seed : seed),
      selectedSpeciesId: null,
      selectedOrganismId: null,
      simulationTime: 0,
      isRunning: true,
    }));
  },

  setSeed: (seed) => {
    set(() => ({
      ...createSeededState(seed),
      simulationTime: 0,
    }));
  },

  toggleLabels: () => {
    set((prev) => ({ showLabels: !prev.showLabels }));
  },

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
