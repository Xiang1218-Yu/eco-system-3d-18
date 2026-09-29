import * as THREE from 'three';
import type { Organism, Species } from '@/types/ecosystem';
import { getSpeciesById } from '@/data/species';
import type { RandomSource } from '@/utils/random';
import { generateId } from '@/utils/random';
import { AQUARIUM_BOUNDS } from '@/constants/aquarium';

/**
 * 在实验随机流内取一个初始位置。
 * 生产者贴在缸底，其余生物分布在水体中。
 */
export function randomPosition(species: Species, rng: RandomSource): THREE.Vector3 {
  const isProducer = species.trophicLevel === 'producer';
  const minY = isProducer ? AQUARIUM_BOUNDS.minY : AQUARIUM_BOUNDS.minY + 0.3;
  const maxY = isProducer ? AQUARIUM_BOUNDS.minY + 0.5 : AQUARIUM_BOUNDS.maxY - 0.3;

  return new THREE.Vector3(
    AQUARIUM_BOUNDS.minX + rng.next() * (AQUARIUM_BOUNDS.maxX - AQUARIUM_BOUNDS.minX),
    minY + rng.next() * (maxY - minY),
    AQUARIUM_BOUNDS.minZ + rng.next() * (AQUARIUM_BOUNDS.maxZ - AQUARIUM_BOUNDS.minZ),
  );
}

/**
 * 创建一只初始生物。
 *
 * 初始位置、速度、能量、年龄、朝向、缩放都消费 experiment 随机流，
 * 因此属于可复现实验状态的一部分；ID 单独消费 id 随机流，
 * 只作为渲染/索引键使用，不影响演化结果。
 */
export function createOrganism(
  speciesId: string,
  streams: { experiment: RandomSource; id: RandomSource },
  position?: THREE.Vector3,
): Organism | null {
  const species = getSpeciesById(speciesId);
  if (!species) return null;

  const rng = streams.experiment;
  const pos = position ? position.clone() : randomPosition(species, rng);

  return {
    id: generateId(streams.id),
    speciesId,
    position: pos,
    velocity: new THREE.Vector3(
      (rng.next() - 0.5) * species.speed,
      (rng.next() - 0.5) * species.speed * 0.5,
      (rng.next() - 0.5) * species.speed,
    ),
    energy: species.energyValue * (0.7 + rng.next() * 0.3),
    age: rng.next() * species.lifespan * 0.3,
    state: 'idle',
    targetId: null,
    rotation: rng.next() * Math.PI * 2,
    scale: 0.8 + rng.next() * 0.4,
  };
}
