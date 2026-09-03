export const EPSILON = 1e-7;
export function clamp(value: number, min = 0, max = 1): number { return Math.min(max, Math.max(min, value)); }
export function almostEqual(a: number, b: number, epsilon = 1e-6): boolean { return Math.abs(a - b) <= epsilon; }
export function normalizeHue(degrees: number): number { return ((degrees % 360) + 360) % 360; }
export function multiplyMatrix3(matrix: readonly (readonly [number, number, number])[], vector: readonly [number, number, number]): [number, number, number] {
  return [matrix[0]![0] * vector[0] + matrix[0]![1] * vector[1] + matrix[0]![2] * vector[2], matrix[1]![0] * vector[0] + matrix[1]![1] * vector[1] + matrix[1]![2] * vector[2], matrix[2]![0] * vector[0] + matrix[2]![1] * vector[1] + matrix[2]![2] * vector[2]];
}
