import { GENERATORS, UPGRADES } from './data';
import { GameState, GeneratorId, UpgradeId } from './types';

const generatorById = Object.fromEntries(GENERATORS.map((g) => [g.id, g]));

export const formatNumber = (value: number): string => {
  if (!Number.isFinite(value)) return '∞';
  const abs = Math.abs(value);
  if (abs < 1000) return value.toFixed(abs >= 100 ? 0 : abs >= 10 ? 1 : 2);
  const suffixes = ['K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp'];
  let idx = -1;
  let scaled = abs;
  while (scaled >= 1000 && idx < suffixes.length - 1) {
    scaled /= 1000;
    idx += 1;
  }
  if (idx === suffixes.length - 1 && scaled >= 1000) return value.toExponential(2);
  return `${Math.sign(value) * scaled >= 0 ? '' : '-'}${scaled.toFixed(2)}${suffixes[idx]}`;
};

export const getGeneratorCost = (generatorId: GeneratorId, owned: number, offset = 0, state?: GameState): number => {
  const def = generatorById[generatorId];
  let cost = def.baseCost * Math.pow(def.costGrowth, owned + offset);
  if (generatorId === 'probe' && state && state.upgrades.probe_blueprints > 0) cost *= 0.88;
  return cost;
};

export const getBuyMaxCount = (state: GameState, generatorId: GeneratorId): number => {
  const owned = state.generators[generatorId];
  let signal = state.signal;
  let count = 0;
  // bounded loop for stability and readability
  while (count < 10_000) {
    const nextCost = getGeneratorCost(generatorId, owned, count, state);
    if (signal < nextCost) break;
    signal -= nextCost;
    count += 1;
  }
  return count;
};

const hasUpgrade = (state: GameState, id: UpgradeId) => state.upgrades[id] > 0;

export const getGlobalMultiplier = (state: GameState): number => {
  let mult = 1;
  if (hasUpgrade(state, 'calibration_pass')) mult *= 1.5;
  if (hasUpgrade(state, 'thermal_stabilizers')) mult *= 1.8;
  if (hasUpgrade(state, 'error_correcting')) mult *= 2;
  mult *= Math.pow(1.08, state.upgrades.cataloged_patterns);

  const relayEffectBoost = 1 + state.upgrades.relay_amplification * 0.05;
  mult *= 1 + state.relays * 0.02 * relayEffectBoost;

  // Noise modeled with sqrt scaling to soften very late penalties.
  const baseNoisePenalty = 1 / (1 + state.noise / 100);
  const mitigation = hasUpgrade(state, 'adaptive_gain_control') ? 0.4 : 0;
  const effectivePenalty = 1 - (1 - baseNoisePenalty) * (1 - mitigation);
  mult *= Math.max(0.05, effectivePenalty);

  return mult;
};

export const getGeneratorMultiplier = (state: GameState, generatorId: GeneratorId): number => {
  let mult = 1;
  if (generatorId === 'dish') {
    if (hasUpgrade(state, 'dish_mk2')) mult *= 3;
    if (hasUpgrade(state, 'dish_mk3')) mult *= 3;
  }
  if (generatorId === 'probe') {
    if (hasUpgrade(state, 'probe_mk2')) mult *= 3;
    if (hasUpgrade(state, 'probe_mk3')) mult *= 3;
  }
  if (generatorId === 'supercomputer') {
    if (hasUpgrade(state, 'supercomputer_mk2')) mult *= 3;
    if (hasUpgrade(state, 'supercomputer_mk3')) mult *= 3;
  }
  return mult;
};

export const getTotalSps = (state: GameState): number => {
  const global = getGlobalMultiplier(state);
  return GENERATORS.reduce((sum, gen) => {
    const owned = state.generators[gen.id];
    return sum + owned * gen.baseSps * getGeneratorMultiplier(state, gen.id) * global;
  }, 0);
};

export const getClickPower = (state: GameState): number => {
  let click = 1;
  if (hasUpgrade(state, 'better_antenna')) click *= 2;
  if (hasUpgrade(state, 'narrowband_filter')) click *= 2;
  click *= Math.pow(1.1, state.upgrades.signal_mapping);
  if (hasUpgrade(state, 'burst_sampling')) click += getTotalSps(state) * 0.05;
  return click;
};

export const getAutoScanRate = (state: GameState): number => {
  let scans = 0;
  if (hasUpgrade(state, 'auto_scan_daemon_1')) scans += 1;
  if (hasUpgrade(state, 'auto_scan_daemon_2')) scans += 4;
  return scans;
};

export const computeNoise = (state: GameState): number => {
  const totalGens = Object.values(state.generators).reduce((a, b) => a + b, 0);
  return Math.sqrt(totalGens) * 4;
};


export const getUpgradeCost = (state: GameState, upgradeId: UpgradeId): number => {
  const up = UPGRADES.find((candidate) => candidate.id === upgradeId);
  if (!up) return Number.POSITIVE_INFINITY;
  if (!up.repeatable) return up.cost;
  const level = state.upgrades[upgradeId];
  const growth = up.costGrowth ?? 1;
  return up.cost * Math.pow(growth, level);
};

export const getPassiveDpPerSecond = (state: GameState): number =>
  state.upgrades.passive_research * 0.08;

export const canPurchaseUpgrade = (state: GameState, upgradeId: UpgradeId): boolean => {
  const up = UPGRADES.find((u) => u.id === upgradeId);
  if (!up) return false;
  if (up.maxLevel && state.upgrades[upgradeId] >= up.maxLevel) return false;
  if (!up.repeatable && state.upgrades[upgradeId] > 0) return false;
  if (up.prerequisites && !up.prerequisites(state)) return false;
  const cost = getUpgradeCost(state, upgradeId);
  if (up.currencyType === 'signal') return state.signal >= cost;
  if (up.currencyType === 'dp') return state.dp >= cost;
  return state.relays >= cost;
};

export const getPrestigeProjection = (totalSignalEarned: number): number => {
  if (totalSignalEarned < 1e8) return 0;
  return Math.max(0, Math.floor(Math.log10(totalSignalEarned / 1e8) * 8 + Math.sqrt(totalSignalEarned / 1e10)));
};

export const canPrestige = (state: GameState): boolean =>
  state.generators.correlator >= 1 || state.totalSignalEarned >= 1e12;

export const runSanityChecks = (state: GameState): string[] => {
  const issues: string[] = [];
  const max = getBuyMaxCount(state, 'scanner');
  if (max < 0) issues.push('Buy max produced negative count.');

  const projection = getPrestigeProjection(state.totalSignalEarned + 1e12);
  if (projection <= 0) issues.push('Prestige projection failed expected positive at 1e12+ total signal.');
  return issues;
};
