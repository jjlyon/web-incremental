import { GameState } from './types';

const SAVE_KEY = 'signal-and-salvage-save-v1';

export const saveGame = (state: GameState): void => {
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
};

export const loadGame = (): GameState | null => {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as GameState;
  } catch {
    return null;
  }
};

export const exportSave = (state: GameState): string => JSON.stringify(state);

export const importSave = (raw: string): GameState | null => {
  try {
    return JSON.parse(raw) as GameState;
  } catch {
    return null;
  }
};

export const clearSave = (): void => {
  localStorage.removeItem(SAVE_KEY);
};
