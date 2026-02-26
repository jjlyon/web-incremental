import { BeaconUpgradeDef, GameState, GeneratorDef, MilestoneDef, RelayProtocolDef, RelayUpgradeDef, UpgradeDef } from './types';

export const BALANCE = {
  relayBaseGlobalPerRelay: 0.025,
  relayPrestigeBase: 1e12,
  relayPrestigeExponent: 0.22,
  beaconUnlockRelays: 25,
  beaconUnlockSignal: 1e18,
  beaconBaseSignal: 1e18,
  beaconSignalExponent: 0.2,
  beaconRelayExponent: 0.72,
} as const;

export const GENERATORS: GeneratorDef[] = [
  { id: 'scanner', name: 'Handheld Scanner', baseCost: 15, costGrowth: 1.15, baseSps: 0.2 },
  { id: 'dish', name: 'Dish Array', baseCost: 120, costGrowth: 1.16, baseSps: 1.4 },
  { id: 'sifter', name: 'Signal Sifter', baseCost: 1_100, costGrowth: 1.17, baseSps: 8 },
  { id: 'probe', name: 'Deep-Space Probe', baseCost: 12_000, costGrowth: 1.18, baseSps: 47 },
  { id: 'supercomputer', name: 'Orbital Supercomputer', baseCost: 175_000, costGrowth: 1.19, baseSps: 290 },
  { id: 'correlator', name: 'Quantum Correlator', baseCost: 3_500_000, costGrowth: 1.205, baseSps: 2200 },
];

const hasMilestone = (state: GameState, id: string) => state.milestonesClaimed.includes(id);

export const UPGRADES: UpgradeDef[] = [
  { id: 'better_antenna', name: 'Better Antenna', description: 'Double manual scan output.', cost: 40, currencyType: 'signal' },
  { id: 'narrowband_filter', name: 'Narrowband Filter', description: 'Manual scans x2 again.', cost: 250, currencyType: 'signal' },
  { id: 'burst_sampling', name: 'Burst Sampling', description: 'Manual scans gain +5% of passive SPS.', cost: 2200, currencyType: 'signal' },

  { id: 'calibration_pass', name: 'Calibration Pass', description: 'Global production x1.5.', cost: 600, currencyType: 'signal' },
  { id: 'thermal_stabilizers', name: 'Thermal Stabilizers', description: 'Global production x1.8.', cost: 7_000, currencyType: 'signal' },
  { id: 'error_correcting', name: 'Error-Correcting Codes', description: 'Global production x2.', cost: 85_000, currencyType: 'signal' },
  { id: 'adaptive_gain_control', name: 'Adaptive Gain Control', description: 'Noise penalty is 40% weaker.', cost: 350_000, currencyType: 'signal' },

  { id: 'dish_mk2', name: 'Dish Array Mk II', description: 'Dish Array output x3.', cost: 1_500, currencyType: 'signal', prerequisites: (s) => s.generators.dish >= 10 },
  { id: 'dish_mk3', name: 'Dish Array Mk III', description: 'Dish Array output x3.', cost: 40_000, currencyType: 'signal', prerequisites: (s) => s.generators.dish >= 50 && s.upgrades.dish_mk2 > 0 },
  { id: 'probe_mk2', name: 'Probe Mk II', description: 'Deep-Space Probe output x3.', cost: 180_000, currencyType: 'signal', prerequisites: (s) => s.generators.probe >= 10 },
  { id: 'probe_mk3', name: 'Probe Mk III', description: 'Deep-Space Probe output x3.', cost: 2_000_000, currencyType: 'signal', prerequisites: (s) => s.generators.probe >= 40 && s.upgrades.probe_mk2 > 0 },
  { id: 'supercomputer_mk2', name: 'Supercomputer Mk II', description: 'Orbital Supercomputer output x3.', cost: 1_250_000, currencyType: 'signal', prerequisites: (s) => s.generators.supercomputer >= 8 },
  { id: 'supercomputer_mk3', name: 'Supercomputer Mk III', description: 'Orbital Supercomputer output x3.', cost: 18_000_000, currencyType: 'signal', prerequisites: (s) => s.generators.supercomputer >= 30 && s.upgrades.supercomputer_mk2 > 0 },

  { id: 'unlock_buy_max', name: 'Batch Procurement', description: 'Unlock Buy 10 / Buy Max controls.', cost: 8_500, currencyType: 'signal', prerequisites: (s) => hasMilestone(s, 'm_first_dish') },
  { id: 'auto_scan_daemon_1', name: 'Auto-Scan Daemon I', description: 'Automatically performs 1 scan/sec.', cost: 45_000, currencyType: 'signal' },
  { id: 'auto_scan_daemon_2', name: 'Auto-Scan Daemon II', description: 'Auto scan rate +4 scans/sec.', cost: 380_000, currencyType: 'signal', prerequisites: (s) => s.upgrades.auto_scan_daemon_1 > 0 },

  { id: 'cataloged_patterns', name: 'Cataloged Patterns', description: 'Repeatable: +8% global production.', cost: 4, currencyType: 'dp', repeatable: true, costGrowth: 1.12 },
  { id: 'signal_mapping', name: 'Signal Mapping', description: 'Repeatable: +10% click power.', cost: 6, currencyType: 'dp', repeatable: true, costGrowth: 1.1 },
  { id: 'passive_research', name: 'Passive Research Loop', description: 'Repeatable: +0.08 passive DP/sec.', cost: 7, currencyType: 'dp', repeatable: true, costGrowth: 1.14 },
  { id: 'probe_blueprints', name: 'Probe Blueprints', description: 'Deep-Space Probes cost 12% less.', cost: 20, currencyType: 'dp', prerequisites: (s) => s.generators.probe >= 1 || s.totalSignalEarned > 250_000 },
];

export const RELAY_PROTOCOLS: RelayProtocolDef[] = [
  { id: 'boot_sequence_cache', name: 'Boot Sequence Cache', description: 'Start each run with +1 Handheld Scanner.', cost: 1 },
  { id: 'accelerated_sampling', name: 'Accelerated Sampling', description: 'Manual scan click power +15%.', cost: 1 },
  { id: 'preloaded_coordinates', name: 'Preloaded Coordinates', description: 'Start each run with +200 signal.', cost: 2 },
  { id: 'relay_synchronization', name: 'Relay Synchronization', description: 'Generator production +5%.', cost: 2 },
  { id: 'persistent_scripts', name: 'Persistent Scripts', description: 'Keep buy controls and auto-scan upgrades on Relay reset.', cost: 3 },
];

export const RELAY_UPGRADES: RelayUpgradeDef[] = [
  { id: 'relay_efficiency', name: 'Relay Efficiency', description: 'Repeatable: Relays are 5% more effective.', cost: 1, tier: 1, unlockAtRelays: 0, repeatable: true, costGrowth: 1.35 },
  { id: 'lean_procurement', name: 'Lean Procurement', description: 'Scanners and Dishes cost 10% less.', cost: 2, tier: 1, unlockAtRelays: 0 },
  { id: 'finding_archive', name: 'Finding Archive', description: 'Discovery Point rewards from findings +25%.', cost: 4, tier: 2, unlockAtRelays: 5 },
  { id: 'spectral_refinement', name: 'Spectral Refinement', description: 'Noise grows 12% slower.', cost: 5, tier: 2, unlockAtRelays: 5 },
  { id: 'autonomous_scanners', name: 'Autonomous Scanner Swarm', description: 'Auto scans perform +1.5 scans/sec.', cost: 6, tier: 2, unlockAtRelays: 5 },
  { id: 'resonant_interface', name: 'Resonant Interface', description: 'Structural: manual scans gain +2% of SPS.', cost: 10, tier: 3, unlockAtRelays: 15 },
  { id: 'forward_outpost', name: 'Forward Outpost', description: 'Structural: start each run with +1 Dish Array.', cost: 12, tier: 3, unlockAtRelays: 15 },
];

export const BEACON_UPGRADES: BeaconUpgradeDef[] = [
  { id: 'signal_echo', name: 'Signal Echo', description: 'Repeatable: early generator costs -6%.', cost: 1, repeatable: true, costGrowth: 1.8, maxLevel: 6 },
  { id: 'archive_persistence', name: 'Archive Persistence', description: 'Repeatable: +0.12 passive DP/sec after resets.', cost: 1, repeatable: true, costGrowth: 1.7, maxLevel: 8 },
  { id: 'network_memory', name: 'Network Memory', description: 'Repeatable: gain +1 bonus Relay Energy on each Relay reset.', cost: 2, repeatable: true, costGrowth: 2, maxLevel: 5 },
  { id: 'quantum_index', name: 'Quantum Index', description: 'Repeatable: relay upgrade costs -8%.', cost: 2, repeatable: true, costGrowth: 2.2, maxLevel: 5 },
];

export const MILESTONES: MilestoneDef[] = [
  { id: 'm_first_scan', name: 'First Contact', description: 'Reach 100 total signal earned.', dpReward: 3, condition: (s) => s.totalSignalEarned >= 100 },
  { id: 'm_first_gen', name: 'Basic Toolkit', description: 'Own 1 Handheld Scanner.', dpReward: 3, condition: (s) => s.generators.scanner >= 1 },
  { id: 'm_first_dish', name: 'Dish Online', description: 'Own 1 Dish Array.', dpReward: 4, condition: (s) => s.generators.dish >= 1 },
  { id: 'm_dish_field', name: 'Array Field', description: 'Own 25 Dish Arrays.', dpReward: 7, condition: (s) => s.generators.dish >= 25 },
  { id: 'm_probe_launch', name: 'Probe Launch', description: 'Own 1 Deep-Space Probe.', dpReward: 8, condition: (s) => s.generators.probe >= 1 },
  { id: 'm_supercomputer', name: 'Orbital Think Tank', description: 'Own 1 Orbital Supercomputer.', dpReward: 11, condition: (s) => s.generators.supercomputer >= 1 },
  { id: 'm_big_signal', name: 'Signal Surge', description: 'Reach 1e8 total signal earned.', dpReward: 13, condition: (s) => s.totalSignalEarned >= 1e8 },
  { id: 'm_noise_research', name: 'Noise Anthropology', description: 'Reach 30 noise.', dpReward: 7, condition: (s) => s.noise >= 30 },
  { id: 'm_correlator_sync', name: 'Correlator Sync', description: 'Own 1 Quantum Correlator.', dpReward: 18, condition: (s) => s.generators.correlator >= 1 },
  { id: 'm_deep_archive', name: 'Deep Archive', description: 'Reach 1e12 total signal earned.', dpReward: 30, condition: (s) => s.totalSignalEarned >= 1e12 },
];
