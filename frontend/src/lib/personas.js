import { BUILT_IN_PERSONAS, CUSTOM_COLORS } from '../constants';

/**
 * Builds an id -> persona lookup covering built-in and user-created personas,
 * so every component resolves names and colors the same way.
 */
export function buildPersonaRegistry(customPersonas = []) {
  const registry = {};
  BUILT_IN_PERSONAS.forEach((p) => { registry[p.id] = { ...p, custom: false }; });
  customPersonas.forEach((p, i) => {
    registry[p.id] = { ...p, color: CUSTOM_COLORS[i % CUSTOM_COLORS.length], custom: true };
  });
  return registry;
}

export function personaColor(registry, id) {
  return registry[id]?.color || '#818cf8';
}

/** Turns a display name into a backend-safe persona id (lowercase, a-z0-9_). */
export function slugifyPersonaId(name, existingIds = []) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30) || 'custom';
  let id = `c_${base}`;
  let n = 2;
  while (existingIds.includes(id)) {
    id = `c_${base}_${n}`;
    n += 1;
  }
  return id;
}

const clamp = (v) => Math.max(1, Math.min(10, v));

/** Target tone implied by the sliders, plotted on the radar as a dashed "goal" shape. */
export function slidersToTarget(sliders) {
  return {
    formality: sliders.formality,
    warmth: sliders.warmth,
    brevity: sliders.brevity,
    directness: sliders.directness,
    // Formal writing usually reads harder, so the readability target eases as formality rises.
    readability: clamp(Math.round((11 - sliders.formality * 0.6) * 10) / 10),
  };
}
