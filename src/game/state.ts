import { BEACON_UPGRADES, MILESTONES, RELAY_PROTOCOLS, RELAY_UPGRADES, UPGRADES } from './data';
import {
  canBeaconReset,
  canPrestige,
  canPurchaseBeaconUpgrade,
  canPurchaseRelayProtocol,
  canPurchaseRelayUpgrade,
  canPurchaseUpgrade,
  computeNoise,
  getAutoScanRate,
  getBeaconProjection,
  getBuyMaxCount,
  getClickPower,
  getGeneratorCost,
  getMilestoneDpReward,
  getPassiveDpPerSecond,
  getPrestigeGain,
  getRelayEnergyPerRelay,
  getRelayUpgradeCost,
  getTotalSps,
  getUpgradeCost,
  getBeaconUpgradeCost,
} from './economy';
import { Action, BeaconUpgradeId, GameState, GeneratorId, RelayProtocolId, RelayUpgradeId, UpgradeId } from './types';

const emptyGenerators = { scanner: 0, dish: 0, sifter: 0, probe: 0, supercomputer: 0, correlator: 0 };
const emptyUpgrades = Object.fromEntries(UPGRADES.map((u) => [u.id, 0])) as Record<UpgradeId, number>;
const emptyRelayProtocols = Object.fromEntries(RELAY_PROTOCOLS.map((u) => [u.id, 0])) as Record<RelayProtocolId, number>;
const emptyRelayUpgrades = Object.fromEntries(RELAY_UPGRADES.map((u) => [u.id, 0])) as Record<RelayUpgradeId, number>;
const emptyBeaconUpgrades = Object.fromEntries(BEACON_UPGRADES.map((u) => [u.id, 0])) as Record<BeaconUpgradeId, number>;

const applyRunStartBonuses = (state: GameState): GameState => {
  const next = { ...state, generators: { ...state.generators } };
  if (next.relayProtocols.boot_sequence_cache > 0) next.generators.scanner += 1;
  if (next.relayProtocols.preloaded_coordinates > 0) {
    next.signal += 200;
    next.totalSignalEarned += 200;
  }
  if (next.relayUpgrades.forward_outpost > 0) next.generators.dish += 1;
  return next;
};

export const createInitialState = (): GameState => {
  const now = Date.now();
  return {
    signal: 0,
    totalSignalEarned: 0,
    noise: 0,
    dp: 0,
    relays: 0,
    totalRelaysEarned: 0,
    relayEnergy: 0,
    networkFragments: 0,
    beacons: 0,
    generators: { ...emptyGenerators },
    upgrades: { ...emptyUpgrades },
    relayProtocols: { ...emptyRelayProtocols },
    relayUpgrades: { ...emptyRelayUpgrades },
    beaconUpgrades: { ...emptyBeaconUpgrades },
    milestonesClaimed: [],
    currentTab: 'Control',
    autoClaimFindings: false,
    autoBuyEnabled: false,
    buyAmount: 1,
    lastSaveAt: now,
    startedAt: now,
  };
};

const addSignal = (state: GameState, amount: number): GameState => ({ ...state, signal: state.signal + amount, totalSignalEarned: state.totalSignalEarned + amount });

const buyGenerator = (state: GameState, generatorId: GeneratorId, amount: number | 'max'): GameState => {
  const count = amount === 'max' ? getBuyMaxCount(state, generatorId) : amount;
  if (count <= 0) return state;

  let signal = state.signal;
  let purchased = 0;
  const owned = state.generators[generatorId];
  for (let i = 0; i < count; i += 1) {
    const cost = getGeneratorCost(generatorId, owned, i, state);
    if (signal < cost) break;
    signal -= cost;
    purchased += 1;
  }

  if (!purchased) return state;
  return { ...state, signal, generators: { ...state.generators, [generatorId]: owned + purchased } };
};

const sanitize = (state: GameState): GameState => ({ ...state, noise: computeNoise(state) });

const maybeAutoClaim = (state: GameState): GameState => {
  if (!state.autoClaimFindings) return state;
  let next = state;
  for (const milestone of MILESTONES) {
    if (!next.milestonesClaimed.includes(milestone.id) && milestone.condition(next)) {
      next = {
        ...next,
        dp: next.dp + getMilestoneDpReward(next, milestone.dpReward),
        milestonesClaimed: [...next.milestonesClaimed, milestone.id],
      };
    }
  }
  return next;
};

const applyPrestigeReset = (state: GameState): GameState => {
  const gained = getPrestigeGain(state);
  if (gained <= 0 || !canPrestige(state)) return state;

  const keepAutomation = state.relayProtocols.persistent_scripts > 0;
  const next = createInitialState();
  next.dp = state.dp;
  next.networkFragments = state.networkFragments;
  next.beacons = state.beacons;
  next.beaconUpgrades = { ...state.beaconUpgrades };
  next.relays = state.relays + gained;
  next.totalRelaysEarned = state.totalRelaysEarned + gained;
  next.relayEnergy = state.relayEnergy + gained * getRelayEnergyPerRelay(state);
  next.relayProtocols = { ...state.relayProtocols };
  next.relayUpgrades = { ...state.relayUpgrades };
  next.milestonesClaimed = [...state.milestonesClaimed];

  if (keepAutomation) {
    next.upgrades.unlock_buy_max = state.upgrades.unlock_buy_max;
    next.upgrades.auto_scan_daemon_1 = state.upgrades.auto_scan_daemon_1;
    next.upgrades.auto_scan_daemon_2 = state.upgrades.auto_scan_daemon_2;
  }

  return sanitize(applyRunStartBonuses(next));
};

const applyBeaconReset = (state: GameState): GameState => {
  const gained = getBeaconProjection(state);
  if (gained <= 0 || !canBeaconReset(state)) return state;

  const next = createInitialState();
  next.beacons = state.beacons + gained;
  next.networkFragments = state.networkFragments + gained;
  next.beaconUpgrades = { ...state.beaconUpgrades };
  next.milestonesClaimed = [...state.milestonesClaimed];

  return sanitize(applyRunStartBonuses(next));
};

export const gameReducer = (state: GameState, action: Action): GameState => {
  switch (action.type) {
    case 'TICK': {
      const dt = Math.max(0, Math.min(1, action.dt));
      let next = addSignal(state, getTotalSps(state) * dt + getClickPower(state) * getAutoScanRate(state) * dt);
      next = { ...next, dp: next.dp + getPassiveDpPerSecond(next) * dt };
      if (state.autoBuyEnabled && state.upgrades.unlock_buy_max > 0) {
        for (const gen of ['scanner', 'dish', 'sifter', 'probe', 'supercomputer', 'correlator'] as GeneratorId[]) {
          next = buyGenerator(next, gen, 'max');
        }
      }
      return maybeAutoClaim(sanitize(next));
    }
    case 'MANUAL_SCAN':
      return sanitize(addSignal(state, getClickPower(state)));
    case 'BUY_GENERATOR':
      return sanitize(buyGenerator(state, action.generatorId, action.amount));
    case 'BUY_UPGRADE': {
      const up = UPGRADES.find((u) => u.id === action.upgradeId);
      if (!up || !canPurchaseUpgrade(state, action.upgradeId)) return state;
      const spent = up.currencyType === 'signal' ? { ...state, signal: state.signal - getUpgradeCost(state, action.upgradeId) } : { ...state, dp: state.dp - getUpgradeCost(state, action.upgradeId) };
      return sanitize({ ...spent, upgrades: { ...spent.upgrades, [action.upgradeId]: spent.upgrades[action.upgradeId] + 1 } });
    }
    case 'BUY_RELAY_PROTOCOL': {
      if (!canPurchaseRelayProtocol(state, action.protocolId)) return state;
      const protocol = RELAY_PROTOCOLS.find((item) => item.id === action.protocolId);
      if (!protocol) return state;
      return { ...state, relays: state.relays - protocol.cost, relayProtocols: { ...state.relayProtocols, [action.protocolId]: 1 } };
    }
    case 'BUY_RELAY_UPGRADE': {
      if (!canPurchaseRelayUpgrade(state, action.upgradeId)) return state;
      const cost = getRelayUpgradeCost(state, action.upgradeId);
      return { ...state, relayEnergy: state.relayEnergy - cost, relayUpgrades: { ...state.relayUpgrades, [action.upgradeId]: state.relayUpgrades[action.upgradeId] + 1 } };
    }
    case 'BUY_BEACON_UPGRADE': {
      if (!canPurchaseBeaconUpgrade(state, action.upgradeId)) return state;
      const cost = getBeaconUpgradeCost(state, action.upgradeId);
      return { ...state, networkFragments: state.networkFragments - cost, beaconUpgrades: { ...state.beaconUpgrades, [action.upgradeId]: state.beaconUpgrades[action.upgradeId] + 1 } };
    }
    case 'CLAIM_MILESTONE': {
      const milestone = MILESTONES.find((m) => m.id === action.milestoneId);
      if (!milestone || state.milestonesClaimed.includes(action.milestoneId) || !milestone.condition(state)) return state;
      return { ...state, dp: state.dp + getMilestoneDpReward(state, milestone.dpReward), milestonesClaimed: [...state.milestonesClaimed, milestone.id] };
    }
    case 'SET_TAB':
      return { ...state, currentTab: action.tab };
    case 'SET_BUY_AMOUNT':
      return { ...state, buyAmount: action.amount };
    case 'TOGGLE_AUTO_CLAIM':
      return { ...state, autoClaimFindings: !state.autoClaimFindings };
    case 'TOGGLE_AUTO_BUY':
      return { ...state, autoBuyEnabled: !state.autoBuyEnabled };
    case 'PRESTIGE':
      return applyPrestigeReset(state);
    case 'BEACON_RESET':
      return applyBeaconReset(state);
    case 'LOAD_STATE':
      return sanitize(action.payload);
    case 'UPDATE_SAVE_TIME':
      return { ...state, lastSaveAt: action.now };
    case 'HARD_RESET':
      return createInitialState();
    default:
      return state;
  }
};

export const verifyPrestigeReset = (state: GameState): boolean => {
  const projected = getPrestigeGain(state);
  if (projected <= 0) return true;
  const reset = applyPrestigeReset(state);
  return reset.signal >= 0 && reset.generators.correlator === 0 && reset.relays >= state.relays;
};

export const verifyBeaconReset = (state: GameState): boolean => {
  const projected = getBeaconProjection(state);
  if (projected <= 0) return true;
  const reset = applyBeaconReset(state);
  return reset.relays === 0 && reset.dp === 0 && reset.networkFragments >= state.networkFragments;
};
