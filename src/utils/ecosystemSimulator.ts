import * as THREE from 'three';
import type { Organism } from '@/types/ecosystem';
import { getSpeciesById, SPECIES } from '@/data/species';
import { AQUARIUM_BOUNDS } from '@/store/useEcosystemStore';
import { chance, range, type Rng } from '@/utils/random';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function distance(a: THREE.Vector3, b: THREE.Vector3): number {
  return a.distanceTo(b);
}

function findNearestPrey(
  organism: Organism,
  allOrganisms: Organism[],
  excludedIds: Set<string>,
): Organism | null {
  const species = getSpeciesById(organism.speciesId);
  if (!species || species.diet.length === 0) return null;

  let nearest: Organism | null = null;
  let minDist = Infinity;

  for (const other of allOrganisms) {
    if (other.id === organism.id) continue;
    if (excludedIds.has(other.id)) continue;
    if (!species.diet.includes(other.speciesId)) continue;

    const dist = distance(organism.position, other.position);
    if (dist < minDist && dist < 3) {
      minDist = dist;
      nearest = other;
    }
  }

  return nearest;
}

function findNearestPredator(
  organism: Organism,
  allOrganisms: Organism[],
): Organism | null {
  const species = getSpeciesById(organism.speciesId);
  if (!species || species.predators.length === 0) return null;

  let nearest: Organism | null = null;
  let minDist = Infinity;

  for (const other of allOrganisms) {
    if (other.id === organism.id) continue;
    if (!species.predators.includes(other.speciesId)) continue;

    const dist = distance(organism.position, other.position);
    if (dist < minDist && dist < 2.5) {
      minDist = dist;
      nearest = other;
    }
  }

  return nearest;
}

function findNearestDead(
  organism: Organism,
  allOrganisms: Organism[],
  dyingIds: Set<string>,
): Organism | null {
  let nearest: Organism | null = null;
  let minDist = Infinity;

  for (const other of allOrganisms) {
    if (other.id === organism.id) continue;
    if (!dyingIds.has(other.id)) continue;

    const dist = distance(organism.position, other.position);
    if (dist < minDist && dist < 3) {
      minDist = dist;
      nearest = other;
    }
  }

  return nearest;
}

/** 以 2% 的概率随机改变一次游走方向。 */
function maybeWander(rng: Rng, velocity: THREE.Vector3, speed: number): void {
  if (chance(rng, 0.02)) {
    velocity.set(
      range(rng, -0.5, 0.5) * speed,
      range(rng, -0.5, 0.5) * speed * 0.5,
      range(rng, -0.5, 0.5) * speed,
    );
  }
}

export function simulateStep(
  organisms: Organism[],
  rng: Rng,
): {
  updates: { id: string; updates: Partial<Organism> }[];
  toRemove: string[];
  toAdd: { speciesId: string; position: THREE.Vector3 }[];
} {
  const updates: Map<string, Partial<Organism>> = new Map();
  const toRemove: Set<string> = new Set();
  const toAdd: { speciesId: string; position: THREE.Vector3 }[] = [];
  const eatenPrey: Set<string> = new Set();

  for (const organism of organisms) {
    const species = getSpeciesById(organism.speciesId);
    if (!species) continue;

    let energy = organism.energy;
    const age = organism.age + 1;

    if (age >= species.lifespan || energy <= 0) {
      toRemove.add(organism.id);
      continue;
    }

    energy -= 0.05 + species.size * 0.02;

    const organismUpdate: Partial<Organism> = {};
    const newPosition = organism.position.clone();
    const newVelocity = organism.velocity.clone();

    if (species.trophicLevel === 'decomposer') {
      const deadOrganism = findNearestDead(organism, organisms, toRemove);

      if (deadOrganism && energy < species.energyValue * 0.8) {
        organismUpdate.state = 'hunting';
        organismUpdate.targetId = deadOrganism.id;
        const huntDir = new THREE.Vector3()
          .subVectors(deadOrganism.position, organism.position)
          .normalize();
        newVelocity.lerp(huntDir.multiplyScalar(species.speed), 0.1);

        if (distance(organism.position, deadOrganism.position) < species.size * 1.5) {
          energy += getSpeciesById(deadOrganism.speciesId)?.energyValue || 20;
          organismUpdate.state = 'eating';
        }
      } else {
        organismUpdate.state = 'wandering';
        maybeWander(rng, newVelocity, species.speed);
      }

      newPosition.add(newVelocity);

      if (newPosition.x < AQUARIUM_BOUNDS.minX + 0.3) {
        newPosition.x = AQUARIUM_BOUNDS.minX + 0.3;
        newVelocity.x = Math.abs(newVelocity.x);
      }
      if (newPosition.x > AQUARIUM_BOUNDS.maxX - 0.3) {
        newPosition.x = AQUARIUM_BOUNDS.maxX - 0.3;
        newVelocity.x = -Math.abs(newVelocity.x);
      }
      if (newPosition.y < AQUARIUM_BOUNDS.minY + 0.2) {
        newPosition.y = AQUARIUM_BOUNDS.minY + 0.2;
        newVelocity.y = Math.abs(newVelocity.y);
      }
      if (newPosition.y > AQUARIUM_BOUNDS.maxY - 0.2) {
        newPosition.y = AQUARIUM_BOUNDS.maxY - 0.2;
        newVelocity.y = -Math.abs(newVelocity.y);
      }
      if (newPosition.z < AQUARIUM_BOUNDS.minZ + 0.3) {
        newPosition.z = AQUARIUM_BOUNDS.minZ + 0.3;
        newVelocity.z = Math.abs(newVelocity.z);
      }
      if (newPosition.z > AQUARIUM_BOUNDS.maxZ - 0.3) {
        newPosition.z = AQUARIUM_BOUNDS.maxZ - 0.3;
        newVelocity.z = -Math.abs(newVelocity.z);
      }

      organismUpdate.position = newPosition;
      organismUpdate.velocity = newVelocity;
      if (Math.abs(newVelocity.x) > 0.001 || Math.abs(newVelocity.z) > 0.001) {
        organismUpdate.rotation = Math.atan2(newVelocity.x, newVelocity.z);
      }
    } else if (species.trophicLevel !== 'producer' && species.speed > 0) {
      const prey = findNearestPrey(organism, organisms, eatenPrey);
      const predator = findNearestPredator(organism, organisms);

      if (predator) {
        organismUpdate.state = 'fleeing';
        const fleeDir = new THREE.Vector3()
          .subVectors(organism.position, predator.position)
          .normalize();
        newVelocity.lerp(fleeDir.multiplyScalar(species.speed), 0.1);
      } else if (prey && energy < species.energyValue * 0.7) {
        organismUpdate.state = 'hunting';
        organismUpdate.targetId = prey.id;
        const huntDir = new THREE.Vector3()
          .subVectors(prey.position, organism.position)
          .normalize();
        newVelocity.lerp(huntDir.multiplyScalar(species.speed), 0.1);

        if (distance(organism.position, prey.position) < species.size * 0.8) {
          energy += getSpeciesById(prey.speciesId)?.energyValue || 20;
          eatenPrey.add(prey.id);
          toRemove.add(prey.id);
          organismUpdate.state = 'eating';
        }
      } else {
        organismUpdate.state = 'wandering';
        maybeWander(rng, newVelocity, species.speed);
      }

      newPosition.add(newVelocity);

      if (newPosition.x < AQUARIUM_BOUNDS.minX + 0.3) {
        newPosition.x = AQUARIUM_BOUNDS.minX + 0.3;
        newVelocity.x = Math.abs(newVelocity.x);
      }
      if (newPosition.x > AQUARIUM_BOUNDS.maxX - 0.3) {
        newPosition.x = AQUARIUM_BOUNDS.maxX - 0.3;
        newVelocity.x = -Math.abs(newVelocity.x);
      }
      if (newPosition.y < AQUARIUM_BOUNDS.minY + 0.2) {
        newPosition.y = AQUARIUM_BOUNDS.minY + 0.2;
        newVelocity.y = Math.abs(newVelocity.y);
      }
      if (newPosition.y > AQUARIUM_BOUNDS.maxY - 0.2) {
        newPosition.y = AQUARIUM_BOUNDS.maxY - 0.2;
        newVelocity.y = -Math.abs(newVelocity.y);
      }
      if (newPosition.z < AQUARIUM_BOUNDS.minZ + 0.3) {
        newPosition.z = AQUARIUM_BOUNDS.minZ + 0.3;
        newVelocity.z = Math.abs(newVelocity.z);
      }
      if (newPosition.z > AQUARIUM_BOUNDS.maxZ - 0.3) {
        newPosition.z = AQUARIUM_BOUNDS.maxZ - 0.3;
        newVelocity.z = -Math.abs(newVelocity.z);
      }

      organismUpdate.position = newPosition;
      organismUpdate.velocity = newVelocity;
      if (Math.abs(newVelocity.x) > 0.001 || Math.abs(newVelocity.z) > 0.001) {
        organismUpdate.rotation = Math.atan2(newVelocity.x, newVelocity.z);
      }
    } else if (species.trophicLevel === 'producer') {
      organismUpdate.state = 'idle';
      energy += 0.1;
    }

    energy = clamp(energy, 0, species.energyValue * 1.5);
    organismUpdate.energy = energy;
    organismUpdate.age = age;

    if (
      energy > species.energyValue * 0.8 &&
      chance(rng, species.reproductionRate * 0.1)
    ) {
      const aliveCount = organisms.filter(
        (o) => o.speciesId === organism.speciesId && !toRemove.has(o.id),
      ).length;
      if (aliveCount < species.maxPopulation) {
        const offspringPos = organism.position
          .clone()
          .add(
            new THREE.Vector3(
              range(rng, -0.5, 0.5) * 1.5,
              range(rng, 0, 0.5),
              range(rng, -0.5, 0.5) * 1.5,
            ),
          );
        toAdd.push({ speciesId: organism.speciesId, position: offspringPos });
        organismUpdate.energy = energy * 0.5;
      }
    }

    updates.set(organism.id, organismUpdate);
  }

  const updatesArray: { id: string; updates: Partial<Organism> }[] = [];
  updates.forEach((u, id) => {
    if (!toRemove.has(id)) {
      updatesArray.push({ id, updates: u });
    }
  });

  return { updates: updatesArray, toRemove: Array.from(toRemove), toAdd };
}

export function computeFoodChainRelations(organisms: Organism[]): {
  predatorId: string;
  preyId: string;
}[] {
  const relations: { predatorId: string; preyId: string }[] = [];
  const seen = new Set<string>();

  for (const organism of organisms) {
    const species = getSpeciesById(organism.speciesId);
    if (!species) continue;

    for (const preyId of species.diet) {
      const hasPrey = organisms.some((o) => o.speciesId === preyId);
      if (hasPrey) {
        const key = `${organism.speciesId}-${preyId}`;
        if (!seen.has(key)) {
          seen.add(key);
          relations.push({ predatorId: organism.speciesId, preyId });
        }
      }
    }
  }

  return relations;
}

export function getPresentSpecies(organisms: Organism[]): string[] {
  return [...new Set(organisms.map((o) => o.speciesId))];
}

export { SPECIES };
