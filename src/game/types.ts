export type CurrencyType = 'signal' | 'dp' | 'relays';

export type GeneratorId =
  | 'scanner'
  | 'dish'
  | 'sifter'
  | 'probe'
  | 'supercomputer'
  | 'correlator';

export type UpgradeId =
  | 'better_antenna'
  | 'narrowband_filter'
  | 'burst_sampling'
  | 'calibration_pass'
  | 'thermal_stabilizers'
  | 'error_correcting'
  | 'adaptive_gain_control'
  | 'dish_mk2'
  | 'dish_mk3'
  | 'probe_mk2'
  | 'probe_mk3'
  | 'supercomputer_mk2'
  | 'supercomputer_mk3'
  | 'unlock_buy_max'
  | 'auto_scan_daemon_1'
  | 'auto_scan_daemon_2'
  | 'cataloged_patterns'
  | 'signal_mapping'
  | 'probe_blueprints'
  | 'relay_amplification'
  | 'persistent_scripts'
  | 'memory_of_void';

export interface GeneratorDef {
  id: GeneratorId;
  name: string;
  baseCost: number;
  costGrowth: number;
  baseSps: number;
}

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  description: string;
  cost: number;
  currencyType: CurrencyType;
  repeatable?: boolean;
  maxLevel?: number;
  prerequisites?: (state: GameState) => boolean;
}

export interface MilestoneDef {
  id: string;
  name: string;
  description: string;
  dpReward: number;
  condition: (state: GameState) => boolean;
}

export interface GameState {
  signal: number;
  totalSignalEarned: number;
  noise: number;
  dp: number;
  relays: number;
  generators: Record<GeneratorId, number>;
  upgrades: Record<UpgradeId, number>;
  milestonesClaimed: string[];
  currentTab: TabName;
  autoClaimFindings: boolean;
  autoBuyEnabled: boolean;
  buyAmount: 1 | 10 | 'max';
  lastSaveAt: number;
  startedAt: number;
}

export type TabName =
  | 'Control'
  | 'Generators'
  | 'Upgrades'
  | 'Findings'
  | 'Prestige'
  | 'Stats';

export type Action =
  | { type: 'TICK'; dt: number }
  | { type: 'MANUAL_SCAN' }
  | { type: 'BUY_GENERATOR'; generatorId: GeneratorId; amount: number | 'max' }
  | { type: 'BUY_UPGRADE'; upgradeId: UpgradeId }
  | { type: 'CLAIM_MILESTONE'; milestoneId: string }
  | { type: 'SET_TAB'; tab: TabName }
  | { type: 'SET_BUY_AMOUNT'; amount: 1 | 10 | 'max' }
  | { type: 'TOGGLE_AUTO_CLAIM' }
  | { type: 'TOGGLE_AUTO_BUY' }
  | { type: 'PRESTIGE' }
  | { type: 'LOAD_STATE'; payload: GameState }
  | { type: 'UPDATE_SAVE_TIME'; now: number }
  | { type: 'HARD_RESET' };
