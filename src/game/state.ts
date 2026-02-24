import { MILESTONES, UPGRADES } from './data';
import { canPrestige, canPurchaseUpgrade, computeNoise, getAutoScanRate, getBuyMaxCount, getClickPower, getGeneratorCost, getPassiveDpPerSecond, getPrestigeGain, getTotalSps, getUpgradeCost } from './economy';
import { Action, GameState, GeneratorId, UpgradeId } from './types';

const emptyGenerators = {
  scanner: 0,
  dish: 0,
  sifter: 0,
  probe: 0,
  supercomputer: 0,
  correlator: 0,
};

const emptyUpgrades = {
  better_antenna: 0,
  narrowband_filter: 0,
  burst_sampling: 0,
  calibration_pass: 0,
  thermal_stabilizers: 0,
  error_correcting: 0,
  adaptive_gain_control: 0,
  dish_mk2: 0,
  dish_mk3: 0,
  probe_mk2: 0,
  probe_mk3: 0,
  supercomputer_mk2: 0,
  supercomputer_mk3: 0,
  unlock_buy_max: 0,
  auto_scan_daemon_1: 0,
  auto_scan_daemon_2: 0,
  cataloged_patterns: 0,
  signal_mapping: 0,
  passive_research: 0,
  probe_blueprints: 0,
  relay_amplification: 0,
  persistent_scripts: 0,
  memory_of_void: 0,
};

export const createInitialState = (): GameState => {
  const now = Date.now();
  return {
    signal: 0,
    totalSignalEarned: 0,
    noise: 0,
    dp: 0,
    relays: 0,
    generators: { ...emptyGenerators },
    upgrades: { ...emptyUpgrades },
    milestonesClaimed: [],
    currentTab: 'Control',
    autoClaimFindings: false,
    autoBuyEnabled: false,
    buyAmount: 1,
    lastSaveAt: now,
    startedAt: now,
  };
};

const addSignal = (state: GameState, amount: number): GameState => ({
  ...state,
  signal: state.signal + amount,
  totalSignalEarned: state.totalSignalEarned + amount,
});

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

  return {
    ...state,
    signal,
    generators: { ...state.generators, [generatorId]: owned + purchased },
  };
};

const spend = (state: GameState, cost: number, type: 'signal' | 'dp' | 'relays'): GameState => {
  if (type === 'signal') return { ...state, signal: state.signal - cost };
  if (type === 'dp') return { ...state, dp: state.dp - cost };
  return { ...state, relays: state.relays - cost };
};

const sanitize = (state: GameState): GameState => ({ ...state, noise: computeNoise(state) });

const maybeAutoClaim = (state: GameState): GameState => {
  if (!state.autoClaimFindings) return state;
  let next = state;
  for (const milestone of MILESTONES) {
    if (!next.milestonesClaimed.includes(milestone.id) && milestone.condition(next)) {
      next = {
        ...next,
        dp: next.dp + milestone.dpReward,
        milestonesClaimed: [...next.milestonesClaimed, milestone.id],
      };
    }
  }
  return next;
};

const applyPrestigeReset = (state: GameState): GameState => {
  const gained = getPrestigeGain(state);
  if (gained <= 0 || !canPrestige(state)) return state;

  const keepAutomation = state.upgrades.persistent_scripts > 0;
  const keepUpgrades: UpgradeId[] = ['relay_amplification', 'persistent_scripts', 'memory_of_void'];
  if (keepAutomation) keepUpgrades.push('unlock_buy_max', 'auto_scan_daemon_1', 'auto_scan_daemon_2');

  const next = createInitialState();
  next.dp = state.dp;
  next.relays = state.relays + gained;
  next.milestonesClaimed = [...state.milestonesClaimed];
  next.upgrades = { ...emptyUpgrades };
  for (const id of keepUpgrades) next.upgrades[id] = state.upgrades[id];

  if (next.upgrades.memory_of_void > 0) {
    next.signal = 200;
    next.totalSignalEarned = 200;
    next.generators.scanner = 1;
  }

  return sanitize(next);
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
      next = sanitize(next);
      return maybeAutoClaim(next);
    }
    case 'MANUAL_SCAN':
      return sanitize(addSignal(state, getClickPower(state)));
    case 'BUY_GENERATOR':
      return sanitize(buyGenerator(state, action.generatorId, action.amount));
    case 'BUY_UPGRADE': {
      const up = UPGRADES.find((u) => u.id === action.upgradeId);
      if (!up || !canPurchaseUpgrade(state, action.upgradeId)) return state;
      const upgradeCost = getUpgradeCost(state, action.upgradeId);
      const spent = spend(state, upgradeCost, up.currencyType);
      return sanitize({ ...spent, upgrades: { ...spent.upgrades, [action.upgradeId]: spent.upgrades[action.upgradeId] + 1 } });
    }
    case 'CLAIM_MILESTONE': {
      const milestone = MILESTONES.find((m) => m.id === action.milestoneId);
      if (!milestone || state.milestonesClaimed.includes(action.milestoneId) || !milestone.condition(state)) return state;
      return { ...state, dp: state.dp + milestone.dpReward, milestonesClaimed: [...state.milestonesClaimed, milestone.id] };
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
