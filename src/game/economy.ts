import { BALANCE, BEACON_UPGRADES, GENERATORS, RELAY_PROTOCOLS, RELAY_UPGRADES, SIGNAL_SOURCES, UPGRADES } from './data';
import { BeaconUpgradeId, GameState, GeneratorId, RelayProtocolId, RelayUpgradeId, SignalRelay, SignalSource, UpgradeId } from './types';

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

const hasUpgrade = (state: GameState, id: UpgradeId) => state.upgrades[id] > 0;
const hasProtocol = (state: GameState, id: RelayProtocolId) => state.relayProtocols[id] > 0;
const relayUpgradeLevel = (state: GameState, id: RelayUpgradeId) => state.relayUpgrades[id] ?? 0;
const beaconUpgradeLevel = (state: GameState, id: BeaconUpgradeId) => state.beaconUpgrades[id] ?? 0;


const sourceById = Object.fromEntries(SIGNAL_SOURCES.map((source) => [source.id, source]));

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

export const getActiveSource = (state: GameState): SignalSource => sourceById[state.activeSourceId] ?? SIGNAL_SOURCES[0];

export const attenuationAtDistance = (distance: number, falloffFactor: number): number => 1 / (1 + Math.max(0, distance) * Math.max(0, falloffFactor));

export const getRelayAmplificationPerNode = (state: GameState): number => {
  const efficiencyLevel = relayUpgradeLevel(state, 'relay_efficiency');
  const networkLevel = relayUpgradeLevel(state, 'resonant_interface');
  const repeaterLevel = relayUpgradeLevel(state, 'finding_archive');
  const relayEfficiencyBoost = Math.pow(1.15, efficiencyLevel);
  const networkBoost = 1 + networkLevel * BALANCE.relayNetworkBoostPerLevel;
  const repeaterBoost = 1 + repeaterLevel * 0.04;
  return 1.25 * relayEfficiencyBoost * networkBoost * repeaterBoost;
};

export const getRelayAttenuationReducer = (state: GameState): number => {
  const phasedLevel = relayUpgradeLevel(state, 'spectral_refinement');
  return clamp01(phasedLevel * BALANCE.relayAttenuationReductionPerLevel);
};

export const getRelayChain = (state: GameState): SignalRelay[] => {
  const relayCount = Math.max(0, Math.floor(state.relays));
  if (relayCount <= 0) return [];
  const amplification = getRelayAmplificationPerNode(state);
  return Array.from({ length: relayCount }, (_, index) => ({
    id: `relay-${index + 1}`,
    position: (index + 1) / (relayCount + 1),
    amplification,
  }));
};

export interface SignalPipelineBreakdown {
  source: SignalSource;
  baseSignal: number;
  distanceAttenuation: number;
  relayAmplification: number;
  noiseEfficiency: number;
  effectiveSignal: number;
  relayChain: SignalRelay[];
}

export const getNoiseEfficiency = (state: GameState): number => {
  const baseNoisePenalty = 1 / (1 + state.noise / 100);
  const mitigation = hasUpgrade(state, 'adaptive_gain_control') ? 0.4 : 0;
  const effectivePenalty = 1 - (1 - baseNoisePenalty) * (1 - mitigation);
  return Math.max(0.05, effectivePenalty);
};

export const getSignalPipelineBreakdown = (state: GameState): SignalPipelineBreakdown => {
  const source = getActiveSource(state);
  const relayChain = getRelayChain(state);
  const attenuationReducer = getRelayAttenuationReducer(state);
  const effectiveFalloff = state.falloffFactor * (1 - attenuationReducer);
  let relayAmplification = 1;
  let cursor = 0;
  for (const relay of relayChain) {
    const segmentDistance = source.distance * Math.max(0, relay.position - cursor);
    relayAmplification *= attenuationAtDistance(segmentDistance, effectiveFalloff);
    relayAmplification *= relay.amplification;
    cursor = relay.position;
  }
  relayAmplification *= attenuationAtDistance(source.distance * Math.max(0, 1 - cursor), effectiveFalloff);

  const distanceAttenuation = attenuationAtDistance(source.distance, state.falloffFactor);
  const noiseEfficiency = getNoiseEfficiency(state);
  const baseSignal = source.baseSignal;
  const effectiveSignal = baseSignal * distanceAttenuation * relayAmplification * noiseEfficiency;

  return {
    source,
    baseSignal,
    distanceAttenuation,
    relayAmplification,
    noiseEfficiency,
    effectiveSignal,
    relayChain,
  };
};

const getEarlyGeneratorCostMultiplier = (state: GameState, generatorId: GeneratorId): number => {
  let mult = 1;
  if ((generatorId === 'scanner' || generatorId === 'dish') && relayUpgradeLevel(state, 'lean_procurement') > 0) mult *= 0.9;
  const echoLevel = beaconUpgradeLevel(state, 'signal_echo');
  if (generatorId === 'scanner' || generatorId === 'dish' || generatorId === 'sifter') mult *= Math.pow(0.94, echoLevel);
  return mult;
};

export const getGeneratorCost = (generatorId: GeneratorId, owned: number, offset = 0, state?: GameState): number => {
  const def = generatorById[generatorId];
  let cost = def.baseCost * Math.pow(def.costGrowth, owned + offset);
  if (generatorId === 'probe' && state && state.upgrades.probe_blueprints > 0) cost *= 0.88;
  if (state) cost *= getEarlyGeneratorCostMultiplier(state, generatorId);
  return cost;
};

export const getBuyMaxCount = (state: GameState, generatorId: GeneratorId): number => {
  const owned = state.generators[generatorId];
  let signal = state.signal;
  let count = 0;
  while (count < 10_000) {
    const nextCost = getGeneratorCost(generatorId, owned, count, state);
    if (signal < nextCost) break;
    signal -= nextCost;
    count += 1;
  }
  return count;
};

export const getGlobalMultiplier = (state: GameState): number => {
  let mult = 1;
  if (hasUpgrade(state, 'calibration_pass')) mult *= 1.5;
  if (hasUpgrade(state, 'thermal_stabilizers')) mult *= 1.8;
  if (hasUpgrade(state, 'error_correcting')) mult *= 2;
  mult *= Math.pow(1.08, state.upgrades.cataloged_patterns);
  if (hasProtocol(state, 'relay_synchronization')) mult *= 1.05;

  const relayBoost = BALANCE.relayBaseGlobalPerRelay * (1 + relayUpgradeLevel(state, 'relay_efficiency') * 0.05);
  mult *= 1 + state.relays * relayBoost;

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
  const rawProduction = GENERATORS.reduce((sum, gen) => {
    const owned = state.generators[gen.id];
    return sum + owned * gen.baseSps * getGeneratorMultiplier(state, gen.id) * global;
  }, 0);

  const pipeline = getSignalPipelineBreakdown(state);
  const sourceScale = pipeline.effectiveSignal / Math.max(1, pipeline.baseSignal);
  return rawProduction * sourceScale;
};

export const getClickPower = (state: GameState): number => {
  let click = 1;
  if (hasUpgrade(state, 'better_antenna')) click *= 2;
  if (hasUpgrade(state, 'narrowband_filter')) click *= 2;
  if (hasProtocol(state, 'accelerated_sampling')) click *= 1.15;
  click *= Math.pow(1.1, state.upgrades.signal_mapping);
  if (hasUpgrade(state, 'burst_sampling')) click += getTotalSps(state) * 0.05;
  return click;
};

export const getAutoScanRate = (state: GameState): number => {
  let scans = 0;
  if (hasUpgrade(state, 'auto_scan_daemon_1')) scans += 1;
  if (hasUpgrade(state, 'auto_scan_daemon_2')) scans += 4;
  if (relayUpgradeLevel(state, 'autonomous_scanners') > 0) scans += 1.5;
  return scans;
};

export const computeNoise = (state: GameState): number => {
  const totalGens = Object.values(state.generators).reduce((a, b) => a + b, 0);
  const noise = Math.sqrt(totalGens) * 4;
  return Number.isFinite(noise) ? noise : 0;
};

export const getUpgradeCost = (state: GameState, upgradeId: UpgradeId): number => {
  const up = UPGRADES.find((candidate) => candidate.id === upgradeId);
  if (!up) return Number.POSITIVE_INFINITY;
  if (!up.repeatable) return up.cost;
  const level = state.upgrades[upgradeId];
  const growth = up.costGrowth ?? 1;
  return up.cost * Math.pow(growth, level);
};

export const getRelayUpgradeCost = (state: GameState, id: RelayUpgradeId): number => {
  const up = RELAY_UPGRADES.find((candidate) => candidate.id === id);
  if (!up) return Number.POSITIVE_INFINITY;
  let cost = up.cost;
  if (up.repeatable) cost *= Math.pow(up.costGrowth ?? 1, state.relayUpgrades[id]);
  cost *= Math.pow(0.92, beaconUpgradeLevel(state, 'quantum_index'));
  return Math.max(1, cost);
};

export const getBeaconUpgradeCost = (state: GameState, id: BeaconUpgradeId): number => {
  const up = BEACON_UPGRADES.find((candidate) => candidate.id === id);
  if (!up) return Number.POSITIVE_INFINITY;
  if (!up.repeatable) return up.cost;
  return up.cost * Math.pow(up.costGrowth ?? 1, state.beaconUpgrades[id]);
};

export const getPassiveDpPerSecond = (state: GameState): number =>
  state.upgrades.passive_research * 0.08 + beaconUpgradeLevel(state, 'archive_persistence') * 0.12;

export const getMilestoneDpReward = (state: GameState, baseReward: number): number => {
  let reward = baseReward;
  if (relayUpgradeLevel(state, 'finding_archive') > 0) reward *= 1.25;
  return reward;
};

export const canPurchaseUpgrade = (state: GameState, upgradeId: UpgradeId): boolean => {
  const up = UPGRADES.find((u) => u.id === upgradeId);
  if (!up) return false;
  if (up.maxLevel && state.upgrades[upgradeId] >= up.maxLevel) return false;
  if (!up.repeatable && state.upgrades[upgradeId] > 0) return false;
  if (up.prerequisites && !up.prerequisites(state)) return false;
  const cost = getUpgradeCost(state, upgradeId);
  if (up.currencyType === 'signal') return state.signal >= cost;
  return state.dp >= cost;
};

export const getRelayEnergyPerRelay = (state: GameState): number => 1 + state.beaconUpgrades.network_memory;

export const canPurchaseRelayProtocol = (state: GameState, protocolId: RelayProtocolId): boolean => {
  const protocol = RELAY_PROTOCOLS.find((item) => item.id === protocolId);
  if (!protocol) return false;
  return state.relayProtocols[protocolId] === 0 && state.relays >= protocol.cost;
};

export const canPurchaseRelayUpgrade = (state: GameState, id: RelayUpgradeId): boolean => {
  const up = RELAY_UPGRADES.find((item) => item.id === id);
  if (!up) return false;
  if (state.totalRelaysEarned < up.unlockAtRelays) return false;
  if (!up.repeatable && state.relayUpgrades[id] > 0) return false;
  if (up.maxLevel && state.relayUpgrades[id] >= up.maxLevel) return false;
  return state.relayEnergy >= getRelayUpgradeCost(state, id);
};

export const canPurchaseBeaconUpgrade = (state: GameState, id: BeaconUpgradeId): boolean => {
  const up = BEACON_UPGRADES.find((item) => item.id === id);
  if (!up) return false;
  if (!up.repeatable && state.beaconUpgrades[id] > 0) return false;
  if (up.maxLevel && state.beaconUpgrades[id] >= up.maxLevel) return false;
  return state.networkFragments >= getBeaconUpgradeCost(state, id);
};

export const getPrestigeProjection = (totalSignalEarned: number): number => {
  if (totalSignalEarned < BALANCE.relayPrestigeBase) return 0;
  return Math.max(1, Math.floor(Math.pow(totalSignalEarned / BALANCE.relayPrestigeBase, BALANCE.relayPrestigeExponent)));
};

export const getPrestigeGain = (state: GameState): number => {
  const projected = getPrestigeProjection(state.totalSignalEarned);
  if (projected > 0) return projected;
  return state.generators.correlator >= 1 ? 1 : 0;
};

export const canPrestige = (state: GameState): boolean =>
  state.generators.correlator >= 1 || state.totalSignalEarned >= BALANCE.relayPrestigeBase;

const getEffectiveTotalRelays = (state: GameState): number => Math.max(state.totalRelaysEarned, state.relays);

export const canBeaconReset = (state: GameState): boolean =>
  getEffectiveTotalRelays(state) >= BALANCE.beaconUnlockRelays || state.totalSignalEarned >= BALANCE.beaconUnlockSignal;

export const getBeaconProjection = (state: GameState): number => {
  if (!canBeaconReset(state)) return 0;
  const signalTerm = Math.pow(Math.max(1, state.totalSignalEarned / BALANCE.beaconBaseSignal), BALANCE.beaconSignalExponent);
  const relayTerm = Math.pow(Math.max(0, getEffectiveTotalRelays(state)), BALANCE.beaconRelayExponent) / 8;
  return Math.max(1, Math.floor(signalTerm + relayTerm));
};

export const runSanityChecks = (state: GameState): string[] => {
  const issues: string[] = [];
  const max = getBuyMaxCount(state, 'scanner');
  if (max < 0) issues.push('Buy max produced negative count.');
  if (!Number.isFinite(computeNoise(state))) issues.push('Noise became non-finite.');
  if (getPrestigeProjection(BALANCE.relayPrestigeBase) < 1) issues.push('Relay projection should be at least 1 at base threshold.');
  if (getBeaconProjection({ ...state, totalRelaysEarned: 25, totalSignalEarned: 1e18 }) < 1) issues.push('Beacon projection should be positive at unlock thresholds.');
  const pipeline = getSignalPipelineBreakdown(state);
  if (!Number.isFinite(pipeline.effectiveSignal)) issues.push('Signal pipeline produced non-finite output.');
  const attenuationGrowthRate = 1 + getActiveSource(state).distance * state.falloffFactor;
  if (pipeline.relayAmplification >= attenuationGrowthRate * 3.5) issues.push('Relay amplification overtook attenuation growth constraints.');
  return issues;
};
