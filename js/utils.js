/**
 * Shorthand for document.getElementById.
 * @param {string} id
 * @returns {HTMLElement | null}
 */
export const $ = (id) => document.getElementById(id);

/**
 * Seeded PRNG (mulberry32). Returns a function yielding floats in [0, 1).
 * Both simulations use it so their opening states are deterministic.
 * @param {number} seed
 * @returns {() => number}
 */
export function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
