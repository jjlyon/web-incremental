export type CurrencyType = 'signal' | 'dp' | 'relays' | 'relay_energy' | 'network_fragments';

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
  | 'passive_research'
  | 'probe_blueprints';

export type RelayProtocolId =
  | 'boot_sequence_cache'
  | 'accelerated_sampling'
  | 'preloaded_coordinates'
  | 'relay_synchronization'
  | 'persistent_scripts';

export type RelayUpgradeId =
  | 'relay_efficiency'
  | 'lean_procurement'
  | 'finding_archive'
  | 'spectral_refinement'
  | 'autonomous_scanners'
  | 'resonant_interface'
  | 'forward_outpost';

export type BeaconUpgradeId =
  | 'signal_echo'
  | 'archive_persistence'
  | 'network_memory'
  | 'quantum_index';

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
  costGrowth?: number;
  maxLevel?: number;
  prerequisites?: (state: GameState) => boolean;
}

export interface RelayProtocolDef {
  id: RelayProtocolId;
  name: string;
  description: string;
  cost: number;
}

export interface RelayUpgradeDef {
  id: RelayUpgradeId;
  name: string;
  description: string;
  cost: number;
  tier: 1 | 2 | 3;
  unlockAtRelays: number;
  repeatable?: boolean;
  costGrowth?: number;
  maxLevel?: number;
}

export interface BeaconUpgradeDef {
  id: BeaconUpgradeId;
  name: string;
  description: string;
  cost: number;
  repeatable?: boolean;
  costGrowth?: number;
  maxLevel?: number;
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
  totalRelaysEarned: number;
  relayEnergy: number;
  networkFragments: number;
  beacons: number;
  generators: Record<GeneratorId, number>;
  upgrades: Record<UpgradeId, number>;
  relayProtocols: Record<RelayProtocolId, number>;
  relayUpgrades: Record<RelayUpgradeId, number>;
  beaconUpgrades: Record<BeaconUpgradeId, number>;
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
  | 'DP Upgrades'
  | 'Findings'
  | 'Prestige'
  | 'Stats';

export type Action =
  | { type: 'TICK'; dt: number }
  | { type: 'MANUAL_SCAN' }
  | { type: 'BUY_GENERATOR'; generatorId: GeneratorId; amount: number | 'max' }
  | { type: 'BUY_UPGRADE'; upgradeId: UpgradeId }
  | { type: 'BUY_RELAY_PROTOCOL'; protocolId: RelayProtocolId }
  | { type: 'BUY_RELAY_UPGRADE'; upgradeId: RelayUpgradeId }
  | { type: 'BUY_BEACON_UPGRADE'; upgradeId: BeaconUpgradeId }
  | { type: 'CLAIM_MILESTONE'; milestoneId: string }
  | { type: 'SET_TAB'; tab: TabName }
  | { type: 'SET_BUY_AMOUNT'; amount: 1 | 10 | 'max' }
  | { type: 'TOGGLE_AUTO_CLAIM' }
  | { type: 'TOGGLE_AUTO_BUY' }
  | { type: 'PRESTIGE' }
  | { type: 'BEACON_RESET' }
  | { type: 'LOAD_STATE'; payload: GameState }
  | { type: 'UPDATE_SAVE_TIME'; now: number }
  | { type: 'HARD_RESET' };
