import { BEACON_UPGRADES, GENERATORS, MILESTONES, RELAY_PROTOCOLS, RELAY_UPGRADES, UPGRADES } from './data';
import { GameState, TabName } from './types';

const SAVE_KEY = 'signal-and-salvage-save-v2';
const LEGACY_SAVE_KEY = 'signal-and-salvage-save-v1';
const VALID_TABS: TabName[] = ['Control', 'Generators', 'Upgrades', 'DP Upgrades', 'Findings', 'Prestige', 'Stats'];
const VALID_MILESTONES = new Set(MILESTONES.map((milestone) => milestone.id));

const isObjectRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const isNonNegativeInteger = (entry: unknown): entry is number => typeof entry === 'number' && Number.isInteger(entry) && entry >= 0;
const hasNumber = (value: Record<string, unknown>, key: string): boolean => typeof value[key] === 'number' && Number.isFinite(value[key] as number);

const normalizeCountsRecord = (source: unknown, ids: readonly string[]): Record<string, number> | null => {
  if (!isObjectRecord(source)) return null;
  return ids.reduce<Record<string, number>>((acc, id) => {
    acc[id] = isNonNegativeInteger(source[id]) ? (source[id] as number) : 0;
    return acc;
  }, {});
};

const migrateLegacyState = (parsed: Record<string, unknown>): Record<string, unknown> => {
  const upgrades = isObjectRecord(parsed.upgrades) ? parsed.upgrades : {};
  const oldPersistentValue = upgrades.persistent_scripts;
  const oldMemoryValue = upgrades.memory_of_void;
  const oldPersistent = isNonNegativeInteger(oldPersistentValue) && oldPersistentValue > 0;
  const oldMemory = isNonNegativeInteger(oldMemoryValue) && oldMemoryValue > 0;
  const oldAmplification = isNonNegativeInteger(upgrades.relay_amplification) ? (upgrades.relay_amplification as number) : 0;

  return {
    ...parsed,
    totalRelaysEarned: hasNumber(parsed, 'totalRelaysEarned') ? parsed.totalRelaysEarned : (hasNumber(parsed, 'relays') ? parsed.relays : 0),
    relayEnergy: hasNumber(parsed, 'relayEnergy') ? parsed.relayEnergy : (hasNumber(parsed, 'relays') ? parsed.relays : 0),
    networkFragments: hasNumber(parsed, 'networkFragments') ? parsed.networkFragments : 0,
    beacons: hasNumber(parsed, 'beacons') ? parsed.beacons : 0,
    relayProtocols: {
      boot_sequence_cache: oldMemory ? 1 : 0,
      accelerated_sampling: 0,
      preloaded_coordinates: oldMemory ? 1 : 0,
      relay_synchronization: 0,
      persistent_scripts: oldPersistent ? 1 : 0,
      ...(isObjectRecord(parsed.relayProtocols) ? parsed.relayProtocols : {}),
    },
    relayUpgrades: {
      relay_efficiency: oldAmplification,
      lean_procurement: 0,
      finding_archive: 0,
      spectral_refinement: 0,
      autonomous_scanners: 0,
      resonant_interface: 0,
      forward_outpost: 0,
      ...(isObjectRecord(parsed.relayUpgrades) ? parsed.relayUpgrades : {}),
    },
    beaconUpgrades: {
      signal_echo: 0,
      archive_persistence: 0,
      network_memory: 0,
      quantum_index: 0,
      ...(isObjectRecord(parsed.beaconUpgrades) ? parsed.beaconUpgrades : {}),
    },
    upgrades: {
      ...upgrades,
      relay_amplification: undefined,
      persistent_scripts: undefined,
      memory_of_void: undefined,
    },
  };
};

const parseGameState = (raw: string): GameState | null => {
  try {
    const parsedRaw = JSON.parse(raw);
    if (!isObjectRecord(parsedRaw)) return null;
    const parsed = migrateLegacyState(parsedRaw);

    const normalizedGenerators = normalizeCountsRecord(parsed.generators, GENERATORS.map((generator) => generator.id));
    const normalizedUpgrades = normalizeCountsRecord(parsed.upgrades, UPGRADES.map((upgrade) => upgrade.id));
    const normalizedRelayProtocols = normalizeCountsRecord(parsed.relayProtocols, RELAY_PROTOCOLS.map((entry) => entry.id));
    const normalizedRelayUpgrades = normalizeCountsRecord(parsed.relayUpgrades, RELAY_UPGRADES.map((entry) => entry.id));
    const normalizedBeaconUpgrades = normalizeCountsRecord(parsed.beaconUpgrades, BEACON_UPGRADES.map((entry) => entry.id));

    if (!normalizedGenerators || !normalizedUpgrades || !normalizedRelayProtocols || !normalizedRelayUpgrades || !normalizedBeaconUpgrades) return null;

    const normalized: GameState = {
      signal: hasNumber(parsed, 'signal') ? (parsed.signal as number) : 0,
      totalSignalEarned: hasNumber(parsed, 'totalSignalEarned') ? (parsed.totalSignalEarned as number) : 0,
      noise: hasNumber(parsed, 'noise') ? (parsed.noise as number) : 0,
      dp: hasNumber(parsed, 'dp') ? (parsed.dp as number) : 0,
      relays: hasNumber(parsed, 'relays') ? (parsed.relays as number) : 0,
      totalRelaysEarned: hasNumber(parsed, 'totalRelaysEarned') ? (parsed.totalRelaysEarned as number) : 0,
      relayEnergy: hasNumber(parsed, 'relayEnergy') ? (parsed.relayEnergy as number) : 0,
      networkFragments: hasNumber(parsed, 'networkFragments') ? (parsed.networkFragments as number) : 0,
      beacons: hasNumber(parsed, 'beacons') ? (parsed.beacons as number) : 0,
      generators: normalizedGenerators as GameState['generators'],
      upgrades: normalizedUpgrades as GameState['upgrades'],
      relayProtocols: normalizedRelayProtocols as GameState['relayProtocols'],
      relayUpgrades: normalizedRelayUpgrades as GameState['relayUpgrades'],
      beaconUpgrades: normalizedBeaconUpgrades as GameState['beaconUpgrades'],
      milestonesClaimed: Array.isArray(parsed.milestonesClaimed)
        ? parsed.milestonesClaimed.filter((entry): entry is string => typeof entry === 'string' && VALID_MILESTONES.has(entry))
        : [],
      currentTab: typeof parsed.currentTab === 'string' && VALID_TABS.includes(parsed.currentTab as TabName) ? (parsed.currentTab as TabName) : 'Control',
      autoClaimFindings: parsed.autoClaimFindings === true,
      autoBuyEnabled: parsed.autoBuyEnabled === true,
      buyAmount: parsed.buyAmount === 10 || parsed.buyAmount === 'max' ? parsed.buyAmount : 1,
      lastSaveAt: hasNumber(parsed, 'lastSaveAt') ? (parsed.lastSaveAt as number) : Date.now(),
      startedAt: hasNumber(parsed, 'startedAt') ? (parsed.startedAt as number) : Date.now(),
    };

    return normalized;
  } catch {
    return null;
  }
};

export const saveGame = (state: GameState): void => {
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
};

export const loadGame = (): GameState | null => {
  const raw = localStorage.getItem(SAVE_KEY) ?? localStorage.getItem(LEGACY_SAVE_KEY);
  if (!raw) return null;
  return parseGameState(raw);
};

export const exportSave = (state: GameState): string => JSON.stringify(state);
export const importSave = (raw: string): GameState | null => parseGameState(raw);

export const clearSave = (): void => {
  localStorage.removeItem(SAVE_KEY);
  localStorage.removeItem(LEGACY_SAVE_KEY);
};
