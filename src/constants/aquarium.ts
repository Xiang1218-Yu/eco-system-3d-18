/** 生态缸边界常量。独立成模块以避免模拟器与 store 之间的循环依赖。 */
export const AQUARIUM_BOUNDS = {
  minX: -4,
  maxX: 4,
  minY: -2,
  maxY: 2,
  minZ: -2,
  maxZ: 2,
} as const;
