import { GENERATORS, MILESTONES, UPGRADES } from './data';
import { GameState, TabName } from './types';

const SAVE_KEY = 'signal-and-salvage-save-v1';
const VALID_TABS: TabName[] = ['Control', 'Generators', 'Upgrades', 'Findings', 'Prestige', 'Stats'];
const VALID_MILESTONES = new Set(MILESTONES.map((milestone) => milestone.id));

const isObjectRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const hasNumber = (value: Record<string, unknown>, key: string): boolean => typeof value[key] === 'number' && Number.isFinite(value[key] as number);

const hasBoolean = (value: Record<string, unknown>, key: string): boolean => typeof value[key] === 'boolean';

const isNonNegativeInteger = (entry: unknown): boolean => typeof entry === 'number' && Number.isInteger(entry) && entry >= 0;

const hasValidMilestones = (value: Record<string, unknown>, key: string): boolean => (
  Array.isArray(value[key])
  && (value[key] as unknown[]).every((entry) => typeof entry === 'string' && VALID_MILESTONES.has(entry))
);

const hasValidTab = (value: Record<string, unknown>, key: string): boolean => typeof value[key] === 'string' && VALID_TABS.includes(value[key] as TabName);

const hasValidGenerators = (value: Record<string, unknown>): boolean => {
  if (!isObjectRecord(value.generators)) return false;
  const generators = value.generators;
  return GENERATORS.every((generator) => isNonNegativeInteger(generators[generator.id]));
};

const hasValidUpgrades = (value: Record<string, unknown>): boolean => {
  if (!isObjectRecord(value.upgrades)) return false;
  const upgrades = value.upgrades;
  return UPGRADES.every((upgrade) => isNonNegativeInteger(upgrades[upgrade.id]));
};

const normalizeCountsRecord = (
  source: unknown,
  ids: readonly string[],
): Record<string, unknown> | null => {
  if (!isObjectRecord(source)) return null;

  return ids.reduce<Record<string, unknown>>((acc, id) => {
    acc[id] = isNonNegativeInteger(source[id]) ? source[id] : 0;
    return acc;
  }, {});
};

const hasValidBuyAmount = (value: Record<string, unknown>): boolean => value.buyAmount === 1 || value.buyAmount === 10 || value.buyAmount === 'max';

const isValidGameState = (value: unknown): value is GameState => {
  if (!isObjectRecord(value)) return false;

  return (
    hasNumber(value, 'signal')
    && hasNumber(value, 'totalSignalEarned')
    && hasNumber(value, 'noise')
    && hasNumber(value, 'dp')
    && hasNumber(value, 'relays')
    && hasValidGenerators(value)
    && hasValidUpgrades(value)
    && hasValidMilestones(value, 'milestonesClaimed')
    && hasValidTab(value, 'currentTab')
    && hasBoolean(value, 'autoClaimFindings')
    && hasBoolean(value, 'autoBuyEnabled')
    && hasValidBuyAmount(value)
    && hasNumber(value, 'lastSaveAt')
    && hasNumber(value, 'startedAt')
  );
};

const parseGameState = (raw: string): GameState | null => {
  try {
    const parsed = JSON.parse(raw);
    if (!isObjectRecord(parsed)) return null;

    const normalizedGenerators = normalizeCountsRecord(parsed.generators, GENERATORS.map((generator) => generator.id));
    const normalizedUpgrades = normalizeCountsRecord(parsed.upgrades, UPGRADES.map((upgrade) => upgrade.id));

    if (!normalizedGenerators || !normalizedUpgrades) return null;

    const normalized = {
      ...parsed,
      generators: normalizedGenerators,
      upgrades: normalizedUpgrades,
    };

    return isValidGameState(normalized) ? normalized : null;
  } catch {
    return null;
  }
};

export const saveGame = (state: GameState): void => {
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
};

export const loadGame = (): GameState | null => {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return null;
  return parseGameState(raw);
};

export const exportSave = (state: GameState): string => JSON.stringify(state);

export const importSave = (raw: string): GameState | null => parseGameState(raw);

export const clearSave = (): void => {
  localStorage.removeItem(SAVE_KEY);
};
