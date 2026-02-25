import { CSSProperties, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { TabButton } from './components/TabButton';
import { BALANCE, BEACON_UPGRADES, GENERATORS, MILESTONES, RELAY_PROTOCOLS, RELAY_UPGRADES, UPGRADES } from './game/data';
import {
  canBeaconReset,
  canPrestige,
  canPurchaseBeaconUpgrade,
  canPurchaseRelayProtocol,
  canPurchaseRelayUpgrade,
  canPurchaseUpgrade,
  formatNumber,
  getBeaconProjection,
  getBuyMaxCount,
  getClickPower,
  getGeneratorCost,
  getPassiveDpPerSecond,
  getPrestigeGain,
  getRelayUpgradeCost,
  getTotalSps,
  getUpgradeCost,
  getBeaconUpgradeCost,
  runSanityChecks,
} from './game/economy';
import { clearSave, exportSave, importSave, loadGame, saveGame } from './game/save';
import { createInitialState, gameReducer, verifyBeaconReset, verifyPrestigeReset } from './game/state';
import { GeneratorId, TabName } from './game/types';

const tabs: TabName[] = ['Control', 'Generators', 'Upgrades', 'DP Upgrades', 'Findings', 'Prestige', 'Stats'];
const OFFLINE_TICK_CHUNK_SECONDS = 1;
const MAX_OFFLINE_SECONDS = 60 * 60;
const WAVE_WIDTH = 1040;
const WAVE_HEIGHT = 150;
const WAVE_SAMPLE_STEP = 4;
const WAVE_SPEED = 1.8;
const WAVE_FREQUENCIES = [0.45, 0.9, 1.8, 3, 4.8, 7.2];
const WAVE_COLORS = ['#67f3a1', '#6ad5ff', '#9b8cff', '#c5ff6a', '#ffba6a', '#ff6a9f'];
const CLICK_MARKER_LIFETIME_SECONDS = 4.8;
const CLICK_MARKER_SCROLL_PIXELS_PER_SECOND = 210;
const generatorWaveOrder: GeneratorId[] = ['scanner', 'dish', 'sifter', 'probe', 'supercomputer', 'correlator'];

type ClickMarker = { id: number; createdAt: number; amplitude: number };

function App() {
  const [state, dispatch] = useReducer(gameReducer, undefined, createInitialState);
  const [importText, setImportText] = useState('');
  const [exportText, setExportText] = useState('');
  const [clickMarkers, setClickMarkers] = useState<ClickMarker[]>([]);
  const lastTickRef = useRef(performance.now());
  const stateRef = useRef(state);
  const clickMarkerIdRef = useRef(0);
  const inactiveSinceRef = useRef<number | null>(null);

  const applyOfflineTicks = (elapsedMs: number) => {
    const cappedSeconds = Math.min(MAX_OFFLINE_SECONDS, Math.max(0, elapsedMs / 1000));
    const wholeChunks = Math.floor(cappedSeconds / OFFLINE_TICK_CHUNK_SECONDS);
    const remainder = cappedSeconds - wholeChunks * OFFLINE_TICK_CHUNK_SECONDS;
    for (let i = 0; i < wholeChunks; i += 1) dispatch({ type: 'TICK', dt: OFFLINE_TICK_CHUNK_SECONDS });
    if (remainder > 0) dispatch({ type: 'TICK', dt: remainder });
  };

  useEffect(() => {
    const loaded = loadGame();
    if (!loaded) return;
    const now = Date.now();
    dispatch({ type: 'LOAD_STATE', payload: loaded });
    applyOfflineTicks(now - loaded.lastSaveAt);
    dispatch({ type: 'UPDATE_SAVE_TIME', now });
    lastTickRef.current = performance.now();
  }, []);

  useEffect(() => {
    let raf = 0;
    const loop = (now: number) => {
      const dt = (now - lastTickRef.current) / 1000;
      lastTickRef.current = now;
      dispatch({ type: 'TICK', dt });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const id = setInterval(() => {
      saveGame(stateRef.current);
      dispatch({ type: 'UPDATE_SAVE_TIME', now: Date.now() });
    }, 8000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      const now = performance.now() / 1000;
      setClickMarkers((markers) => markers.filter((marker) => now - marker.createdAt < CLICK_MARKER_LIFETIME_SECONDS));
    }, 400);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const resume = () => {
      const since = inactiveSinceRef.current;
      if (since === null) return;
      const now = Date.now();
      applyOfflineTicks(now - since);
      dispatch({ type: 'UPDATE_SAVE_TIME', now });
      inactiveSinceRef.current = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden' && inactiveSinceRef.current === null) inactiveSinceRef.current = Date.now();
      if (document.visibilityState === 'visible') resume();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', () => { if (inactiveSinceRef.current === null) inactiveSinceRef.current = Date.now(); });
    window.addEventListener('focus', resume);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const sps = useMemo(() => getTotalSps(state), [state]);
  const clickPower = useMemo(() => getClickPower(state), [state]);
  const passiveDpPerSecond = getPassiveDpPerSecond(state);
  const relayGain = getPrestigeGain(state);
  const beaconGain = getBeaconProjection(state);
  const canPrestigeNow = canPrestige(state) && relayGain > 0;
  const canBeaconNow = canBeaconReset(state) && beaconGain > 0;

  const hasAffordableGenerator = GENERATORS.some((gen) => state.signal >= getGeneratorCost(gen.id, state.generators[gen.id], 0, state));
  const hasAffordableSignalUpgrade = UPGRADES.some((up) => up.currencyType === 'signal' && canPurchaseUpgrade(state, up.id));
  const hasAffordableDpUpgrade = UPGRADES.some((up) => up.currencyType === 'dp' && canPurchaseUpgrade(state, up.id));
  const hasClaimableFinding = MILESTONES.some((m) => !state.milestonesClaimed.includes(m.id) && m.condition(state));
  const hasAffordableRelayProtocol = RELAY_PROTOCOLS.some((protocol) => canPurchaseRelayProtocol(state, protocol.id));
  const hasAffordableRelayUpgrade = RELAY_UPGRADES.some((up) => canPurchaseRelayUpgrade(state, up.id));
  const hasAffordableBeaconUpgrade = BEACON_UPGRADES.some((up) => canPurchaseBeaconUpgrade(state, up.id));

  const renderGenerators = () => (
    <div className="panel">
      <h3>Generators</h3>
      {GENERATORS.map((gen) => {
        const owned = state.generators[gen.id];
        const desired = state.buyAmount === 'max' ? getBuyMaxCount(state, gen.id) : state.buyAmount;
        const canBuy = desired > 0 && state.signal >= getGeneratorCost(gen.id, owned, 0, state);
        return (
          <div className="row" key={gen.id}>
            <div>
              <strong>{gen.name}</strong> ({owned})
              <div className="muted">Cost: {formatNumber(getGeneratorCost(gen.id, owned, 0, state))} | +{formatNumber(gen.baseSps)} base SPS</div>
            </div>
            <button disabled={!canBuy} onClick={() => dispatch({ type: 'BUY_GENERATOR', generatorId: gen.id, amount: state.buyAmount })}>Buy {state.buyAmount === 'max' ? 'Max' : state.buyAmount}</button>
          </div>
        );
      })}
    </div>
  );

  const renderUpgradeRows = (currency: 'signal' | 'dp') => UPGRADES.filter((up) => up.currencyType === currency).map((up) => {
    const level = state.upgrades[up.id];
    const purchased = !up.repeatable && level > 0;
    const hidden = up.prerequisites && !up.prerequisites(state) && level === 0;
    if (hidden) return null;
    return (
      <div className="row" key={up.id}>
        <div>
          <strong>{up.name}</strong> [{up.currencyType.toUpperCase()} {formatNumber(getUpgradeCost(state, up.id))}] {up.repeatable ? `(Lv ${level})` : purchased ? '(Owned)' : ''}
          <div className="muted">{up.description}</div>
        </div>
        {!purchased && <button disabled={!canPurchaseUpgrade(state, up.id)} onClick={() => dispatch({ type: 'BUY_UPGRADE', upgradeId: up.id })}>Buy</button>}
      </div>
    );
  });

  const renderFindings = () => (
    <div className="panel">
      <h3>Findings & Discovery Points</h3>
      <p className="muted">Passive DP gain: {formatNumber(passiveDpPerSecond)}/s</p>
      <label><input type="checkbox" checked={state.autoClaimFindings} onChange={() => dispatch({ type: 'TOGGLE_AUTO_CLAIM' })} /> Auto-claim findings</label>
      {MILESTONES.map((m) => {
        const claimed = state.milestonesClaimed.includes(m.id);
        const met = m.condition(state);
        return <div className="row" key={m.id}><div><strong>{m.name}</strong> (+{m.dpReward} DP)<div className="muted">{m.description}</div></div><button disabled={claimed || !met} onClick={() => dispatch({ type: 'CLAIM_MILESTONE', milestoneId: m.id })}>{claimed ? 'Claimed' : met ? 'Claim' : 'Locked'}</button></div>;
      })}
    </div>
  );

  const renderPrestige = () => (
    <div className="panel">
      <h3>Meta Uplink</h3>
      <div className="meta-grid">
        <div className="panel inset">
          <h4>Relay Uplink (Reset Signal Run)</h4>
          <p className="muted">Keeps: DP, Relays, Relay Energy, Relay Protocols, Relay Upgrades. Resets: signal, generators, signal upgrades.</p>
          <p>Projection if reset now: <strong>+{formatNumber(relayGain)} Relays</strong> and <strong>+{formatNumber(relayGain + state.beaconUpgrades.network_memory)} Relay Energy</strong>.</p>
          <button disabled={!canPrestigeNow} onClick={() => dispatch({ type: 'PRESTIGE' })}>Initiate Relay Reset</button>
        </div>
        <div className="panel inset">
          <h4>Beacon Network (Reset Signal + DP + Relays)</h4>
          <p className="muted">Unlock at {BALANCE.beaconUnlockRelays} total relays or {BALANCE.beaconUnlockSignal.toExponential(0)} total signal.</p>
          <p className="muted">Keeps: Beacons, Fragments, Beacon upgrades, findings. Resets: Signal, DP, Relays, Relay Energy, Relay Protocols/Upgrades.</p>
          <p>Projection if reset now: <strong>+{formatNumber(beaconGain)} Network Fragments</strong>.</p>
          <button disabled={!canBeaconNow} onClick={() => dispatch({ type: 'BEACON_RESET' })}>Initialize Beacon Reset</button>
        </div>
      </div>

      <h4>Signal Protocols (Relay Energy: {formatNumber(state.relayEnergy)})</h4>
      {RELAY_PROTOCOLS.map((protocol) => (
        <div className="row" key={protocol.id}>
          <div>
            <strong>{protocol.name}</strong> [ENERGY {protocol.cost}] {state.relayProtocols[protocol.id] > 0 ? '(Installed)' : ''}
            <div className="muted">{protocol.description}</div>
          </div>
          {state.relayProtocols[protocol.id] === 0 && <button disabled={!canPurchaseRelayProtocol(state, protocol.id)} onClick={() => dispatch({ type: 'BUY_RELAY_PROTOCOL', protocolId: protocol.id })}>Install</button>}
        </div>
      ))}

      <h4>Relay Upgrades (Relays: {formatNumber(state.relays)} | Total Earned: {formatNumber(state.totalRelaysEarned)})</h4>
      {[1, 2, 3].map((tier) => (
        <div key={`tier-${tier}`}>
          <div className="muted">Tier {tier} {tier === 1 ? '(0+)' : tier === 2 ? '(5+ total relays)' : '(15+ total relays)'}</div>
          {RELAY_UPGRADES.filter((up) => up.tier === tier).map((up) => {
            const locked = state.totalRelaysEarned < up.unlockAtRelays;
            const level = state.relayUpgrades[up.id];
            const cost = getRelayUpgradeCost(state, up.id);
            const owned = !up.repeatable && level > 0;
            return (
              <div className="row" key={up.id}>
                <div>
                  <strong>{up.name}</strong> [RELAYS {formatNumber(cost)}] {up.repeatable ? `(Lv ${level})` : owned ? '(Owned)' : ''}
                  <div className="muted">{up.description}</div>
                </div>
                <button disabled={locked || owned || !canPurchaseRelayUpgrade(state, up.id)} onClick={() => dispatch({ type: 'BUY_RELAY_UPGRADE', upgradeId: up.id })}>{locked ? `Unlocks at ${up.unlockAtRelays}` : 'Buy'}</button>
              </div>
            );
          })}
        </div>
      ))}

      <h4>Beacon Upgrades (Network Fragments: {formatNumber(state.networkFragments)})</h4>
      {BEACON_UPGRADES.map((up) => {
        const level = state.beaconUpgrades[up.id];
        const cost = getBeaconUpgradeCost(state, up.id);
        const owned = !up.repeatable && level > 0;
        return (
          <div className="row" key={up.id}>
            <div>
              <strong>{up.name}</strong> [FRAGMENTS {formatNumber(cost)}] {up.repeatable ? `(Lv ${level})` : owned ? '(Owned)' : ''}
              <div className="muted">{up.description}</div>
            </div>
            <button disabled={owned || !canPurchaseBeaconUpgrade(state, up.id)} onClick={() => dispatch({ type: 'BUY_BEACON_UPGRADE', upgradeId: up.id })}>Buy</button>
          </div>
        );
      })}
    </div>
  );

  const handleManualScan = () => {
    const now = performance.now() / 1000;
    setClickMarkers((markers) => [...markers, { id: clickMarkerIdRef.current++, createdAt: now, amplitude: Math.min(WAVE_HEIGHT * 0.42, 4 + Math.log10(clickPower + 1) * 7) }]);
    dispatch({ type: 'MANUAL_SCAN' });
  };

  const sanityIssues = runSanityChecks(state);
  const waveTime = performance.now() / 1000;
  const rawAmplitudes = generatorWaveOrder.map((generatorId) => state.generators[generatorId] * 0.6);
  const amplitudeNormalizer = Math.max(1, Math.max(1, ...rawAmplitudes) / 26);
  const visibleGeneratorWaves = generatorWaveOrder.map((generatorId, index) => {
    const amplitude = rawAmplitudes[index] / amplitudeNormalizer;
    let path = '';
    for (let x = 0; x <= WAVE_WIDTH; x += WAVE_SAMPLE_STEP) {
      const y = WAVE_HEIGHT / 2 + Math.sin((x / WAVE_WIDTH) * WAVE_FREQUENCIES[index] * Math.PI * 2 + waveTime * WAVE_SPEED) * amplitude;
      path += `${x === 0 ? 'M' : 'L'}${x},${y.toFixed(2)} `;
    }
    return { generatorId, generatorName: GENERATORS.find((g) => g.id === generatorId)?.name ?? generatorId, color: WAVE_COLORS[index], owned: state.generators[generatorId], path: path.trim(), isUnlocked: state.generators[generatorId] > 0 };
  }).filter((wave) => wave.isUnlocked);

  const scannerFrequency = WAVE_FREQUENCIES[0];
  const visibleClickMarkers = clickMarkers
    .map((marker) => {
      const markerAge = waveTime - marker.createdAt;
      const x = WAVE_WIDTH - markerAge * CLICK_MARKER_SCROLL_PIXELS_PER_SECOND;
      if (x < -8 || x > WAVE_WIDTH + 8 || markerAge < 0) return null;
      const y = WAVE_HEIGHT / 2 + Math.sin((x / WAVE_WIDTH) * scannerFrequency * Math.PI * 2 + waveTime * WAVE_SPEED) * marker.amplitude;
      return { id: marker.id, x, y };
    })
    .filter((marker): marker is { id: number; x: number; y: number } => marker !== null);

  return (
    <div className="app">
      <h1>Signal & Salvage</h1>
      <div className="panel statsline">
        <div>Signal: {formatNumber(state.signal)}</div><div>Signal/s: {formatNumber(sps)}</div><div>Click Power: {formatNumber(clickPower)}</div>
        <div>Noise: {formatNumber(state.noise)}</div><div>DP: {formatNumber(state.dp)}</div><div>Relays: {formatNumber(state.relays)}</div>
        <div>Relay Energy: {formatNumber(state.relayEnergy)}</div><div>Fragments: {formatNumber(state.networkFragments)}</div><div>Beacons: {formatNumber(state.beacons)}</div>
      </div>

      <div className="panel wave-panel">
        <div className="wave-header"><strong>Signal Oscilloscope</strong><span className="muted">Unlocked generators render individual sinewaves.</span></div>
        <svg viewBox={`0 0 ${WAVE_WIDTH} ${WAVE_HEIGHT}`} className="wave-display" role="img" aria-label="Live generator sinewaves"><path d={`M0,${WAVE_HEIGHT / 2} H${WAVE_WIDTH}`} className="wave-baseline" />{visibleGeneratorWaves.map((wave) => <path key={wave.generatorId} d={wave.path} className="wave-line" style={{ stroke: wave.color, opacity: 0.95 }} />)}{visibleClickMarkers.map((marker) => <circle key={`click-${marker.id}`} cx={marker.x.toFixed(2)} cy={marker.y.toFixed(2)} r={2.8} className="wave-click-marker" />)}</svg>
        <div className="wave-legend">{visibleGeneratorWaves.length > 0 ? visibleGeneratorWaves.map((wave) => <span key={`${wave.generatorId}-legend`} className="wave-legend-item" style={{ '--wave-color': wave.color } as CSSProperties}>{wave.generatorName}: {wave.owned}</span>) : <span className="muted">No unlocked generators yet.</span>}</div>
      </div>

      <div className="tabs">{tabs.map((tab) => {
        const hasAttention =
          (tab === 'Generators' && hasAffordableGenerator) ||
          (tab === 'Upgrades' && hasAffordableSignalUpgrade) ||
          (tab === 'DP Upgrades' && hasAffordableDpUpgrade) ||
          (tab === 'Findings' && hasClaimableFinding) ||
          (tab === 'Prestige' && (canPrestigeNow || canBeaconNow || hasAffordableRelayProtocol || hasAffordableRelayUpgrade || hasAffordableBeaconUpgrade));
        return <TabButton key={tab} tab={tab} active={state.currentTab === tab} hasAttention={hasAttention} onClick={(t) => dispatch({ type: 'SET_TAB', tab: t })} />;
      })}</div>

      {state.currentTab === 'Control' && <div className="panel"><h3>Control Console</h3><button className="big" onClick={handleManualScan}>Manual Scan +{formatNumber(clickPower)} Signal</button><p className="muted">Run loop: Signal → DP → Relays → Beacons.</p></div>}
      {state.currentTab === 'Generators' && renderGenerators()}
      {state.currentTab === 'Upgrades' && <div className="panel"><h3>Signal Upgrades</h3>{renderUpgradeRows('signal')}</div>}
      {state.currentTab === 'DP Upgrades' && <div className="panel"><h3>DP Upgrades</h3>{renderUpgradeRows('dp')}</div>}
      {state.currentTab === 'Findings' && renderFindings()}
      {state.currentTab === 'Prestige' && renderPrestige()}
      {state.currentTab === 'Stats' && (
        <div className="panel"><h3>Stats & Save Tools</h3><div>Total Signal Earned: {formatNumber(state.totalSignalEarned)}</div><div>Last Save: {new Date(state.lastSaveAt).toLocaleTimeString()}</div>
          <div className="actions"><button onClick={() => { saveGame(state); dispatch({ type: 'UPDATE_SAVE_TIME', now: Date.now() }); }}>Manual Save</button><button onClick={() => { clearSave(); dispatch({ type: 'HARD_RESET' }); }}>Hard Reset</button></div>
          <div><button onClick={() => setExportText(exportSave(state))}>Export Save</button><textarea value={exportText} onChange={(e) => setExportText(e.target.value)} rows={3} /></div>
          <div><button onClick={() => { const imported = importSave(importText); if (!imported) return alert('Invalid save JSON'); dispatch({ type: 'LOAD_STATE', payload: imported }); saveGame(imported); }}>Import Save</button><textarea value={importText} onChange={(e) => setImportText(e.target.value)} rows={3} /></div>
          <div>Prestige reset sanity: {verifyPrestigeReset(state) ? 'OK' : 'Check failed'} | Beacon reset sanity: {verifyBeaconReset(state) ? 'OK' : 'Check failed'}{sanityIssues.length > 0 && <pre>{sanityIssues.join('\n')}</pre>}</div>
        </div>
      )}
    </div>
  );
}

export default App;
