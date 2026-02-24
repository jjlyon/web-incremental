import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { TabButton } from './components/TabButton';
import { GENERATORS, MILESTONES, UPGRADES } from './game/data';
import { canPrestige, canPurchaseUpgrade, formatNumber, getBuyMaxCount, getClickPower, getGeneratorCost, getPassiveDpPerSecond, getPrestigeGain, getTotalSps, getUpgradeCost, runSanityChecks } from './game/economy';
import { clearSave, exportSave, importSave, loadGame, saveGame } from './game/save';
import { createInitialState, gameReducer, verifyPrestigeReset } from './game/state';
import { GeneratorId, TabName } from './game/types';

const tabs: TabName[] = ['Control', 'Generators', 'Upgrades', 'DP Upgrades', 'Findings', 'Prestige', 'Stats'];
const OFFLINE_TICK_CHUNK_SECONDS = 1;
const MAX_OFFLINE_SECONDS = 60 * 60;

function App() {
  const [state, dispatch] = useReducer(gameReducer, undefined, createInitialState);
  const [importText, setImportText] = useState('');
  const [exportText, setExportText] = useState('');
  const lastTickRef = useRef(performance.now());
  const stateRef = useRef(state);
  const inactiveSinceRef = useRef<number | null>(null);

  const applyOfflineTicks = (elapsedMs: number) => {
    const cappedSeconds = Math.min(MAX_OFFLINE_SECONDS, Math.max(0, elapsedMs / 1000));
    if (cappedSeconds <= 0) return;

    const wholeChunks = Math.floor(cappedSeconds / OFFLINE_TICK_CHUNK_SECONDS);
    const remainder = cappedSeconds - wholeChunks * OFFLINE_TICK_CHUNK_SECONDS;

    for (let i = 0; i < wholeChunks; i += 1) {
      dispatch({ type: 'TICK', dt: OFFLINE_TICK_CHUNK_SECONDS });
    }
    if (remainder > 0) dispatch({ type: 'TICK', dt: remainder });
  };

  useEffect(() => {
    const loaded = loadGame();
    if (!loaded) return;

    const now = Date.now();
    dispatch({ type: 'LOAD_STATE', payload: loaded });
    applyOfflineTicks(now - loaded.lastSaveAt);
    dispatch({ type: 'UPDATE_SAVE_TIME', now });
    inactiveSinceRef.current = null;
    lastTickRef.current = performance.now();
  }, []);

  useEffect(() => {
    const resumeFromOffline = () => {
      const inactiveSince = inactiveSinceRef.current;
      if (inactiveSince === null) return;

      const now = Date.now();
      applyOfflineTicks(now - inactiveSince);
      dispatch({ type: 'UPDATE_SAVE_TIME', now });
      inactiveSinceRef.current = null;
      lastTickRef.current = performance.now();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && inactiveSinceRef.current === null) {
        inactiveSinceRef.current = Date.now();
        return;
      }
      if (document.visibilityState === 'visible') resumeFromOffline();
    };

    const onBlur = () => {
      if (inactiveSinceRef.current !== null) return;
      inactiveSinceRef.current = Date.now();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', resumeFromOffline);
    window.addEventListener('blur', onBlur);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', resumeFromOffline);
      window.removeEventListener('blur', onBlur);
    };
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

  const sps = useMemo(() => getTotalSps(state), [state]);
  const clickPower = useMemo(() => getClickPower(state), [state]);
  const prestigeGain = getPrestigeGain(state);
  const passiveDpPerSecond = getPassiveDpPerSecond(state);
  const unlockedBuyMax = state.upgrades.unlock_buy_max > 0;
  const hasAffordableGenerator = GENERATORS.some((gen) => {
    const owned = state.generators[gen.id];
    const cost = getGeneratorCost(gen.id, owned, 0, state);
    return state.signal >= cost;
  });
  const hasAffordableSignalOrRelayUpgrade = UPGRADES.some((up) => ['signal', 'relays'].includes(up.currencyType) && canPurchaseUpgrade(state, up.id));
  const hasAffordableDpUpgrade = UPGRADES.some((up) => up.currencyType === 'dp' && canPurchaseUpgrade(state, up.id));
  const hasClaimableFinding = MILESTONES.some((m) => !state.milestonesClaimed.includes(m.id) && m.condition(state));
  const canPrestigeNow = canPrestige(state) && prestigeGain > 0;

  const canAffordGeneratorAmount = (generatorId: GeneratorId, amount: number): boolean => {
    const owned = state.generators[generatorId];
    let totalCost = 0;
    for (let offset = 0; offset < amount; offset += 1) {
      totalCost += getGeneratorCost(generatorId, owned, offset, state);
      if (totalCost > state.signal) return false;
    }
    return true;
  };

  const renderGenerators = () => (
    <div className="panel">
      <h3>Generator Bay</h3>
      {GENERATORS.map((gen) => {
        const owned = state.generators[gen.id];
        const cost = getGeneratorCost(gen.id, owned, 0, state);
        const contribution = owned * gen.baseSps;
        const maxCount = getBuyMaxCount(state, gen.id);
        return (
          <div className="row" key={gen.id}>
            <div>
              <strong>{gen.name}</strong> — Owned: {owned} | Cost: {formatNumber(cost)} | Base contrib: {formatNumber(contribution)}/s
            </div>
            <div className="actions">
              <button disabled={state.signal < cost} onClick={() => dispatch({ type: 'BUY_GENERATOR', generatorId: gen.id, amount: 1 })}>Buy 1</button>
              {unlockedBuyMax && (
                <>
                  <button disabled={!canAffordGeneratorAmount(gen.id, 10)} onClick={() => dispatch({ type: 'BUY_GENERATOR', generatorId: gen.id, amount: 10 })}>Buy 10</button>
                  <button disabled={maxCount <= 0} onClick={() => dispatch({ type: 'BUY_GENERATOR', generatorId: gen.id, amount: 'max' })}>Buy Max ({maxCount})</button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );

  const renderUpgrades = (title: string, currencies: Array<'signal' | 'dp' | 'relays'>) => (
    <div className="panel">
      <h3>{title}</h3>
      {UPGRADES.filter((up) => currencies.includes(up.currencyType)).map((up) => {
        const level = state.upgrades[up.id];
        const purchased = !up.repeatable && level > 0;
        const canBuy = canPurchaseUpgrade(state, up.id);
        const cost = getUpgradeCost(state, up.id);
        const hidden = up.prerequisites && !up.prerequisites(state) && level === 0;
        if (hidden) return null;
        return (
          <div className="row" key={up.id}>
            <div>
              <strong>{up.name}</strong> [{up.currencyType.toUpperCase()} {formatNumber(cost)}] {up.repeatable ? `(Lv ${level})` : purchased ? '(Owned)' : ''}
              <div className="muted">{up.description}</div>
            </div>
            {!purchased && (
              <button disabled={!canBuy} onClick={() => dispatch({ type: 'BUY_UPGRADE', upgradeId: up.id })}>
                Buy
              </button>
            )}
          </div>
        );
      })}
    </div>
  );

  const renderFindings = () => (
    <div className="panel">
      <h3>Findings & Discovery Points</h3>
      <p className="muted">Passive DP gain: {formatNumber(passiveDpPerSecond)}/s</p>
      <label>
        <input type="checkbox" checked={state.autoClaimFindings} onChange={() => dispatch({ type: 'TOGGLE_AUTO_CLAIM' })} /> Auto-claim findings
      </label>
      {MILESTONES.map((m) => {
        const claimed = state.milestonesClaimed.includes(m.id);
        const met = m.condition(state);
        return (
          <div className="row" key={m.id}>
            <div>
              <strong>{m.name}</strong> (+{m.dpReward} DP)
              <div className="muted">{m.description}</div>
            </div>
            <button disabled={claimed || !met} onClick={() => dispatch({ type: 'CLAIM_MILESTONE', milestoneId: m.id })}>
              {claimed ? 'Claimed' : met ? 'Claim' : 'Locked'}
            </button>
          </div>
        );
      })}
    </div>
  );

  const renderPrestige = () => (
    <div className="panel">
      <h3>Relay Uplink (Prestige)</h3>
      <p>Unlock condition: claim Correlator Sync finding OR reach 1e12 total signal.</p>
      <p>Projected relays on reset: <strong>{prestigeGain}</strong></p>
      <button disabled={!canPrestigeNow} onClick={() => dispatch({ type: 'PRESTIGE' })}>Initiate Relay Reset</button>
    </div>
  );

  const runManualSave = () => {
    saveGame(state);
    dispatch({ type: 'UPDATE_SAVE_TIME', now: Date.now() });
  };

  const handleImport = () => {
    const imported = importSave(importText);
    if (!imported) {
      alert('Invalid save JSON');
      return;
    }
    dispatch({ type: 'LOAD_STATE', payload: imported });
    saveGame(imported);
  };

  const hardReset = () => {
    if (!window.confirm('Hard reset everything? This cannot be undone.')) return;
    clearSave();
    dispatch({ type: 'HARD_RESET' });
  };

  const sanityIssues = runSanityChecks(state);

  return (
    <div className="app">
      <h1>Signal & Salvage</h1>
      <div className="panel statsline">
        <div>Signal: {formatNumber(state.signal)}</div>
        <div>Signal/s: {formatNumber(sps)}</div>
        <div>Click Power: {formatNumber(clickPower)}</div>
        <div>Noise: {formatNumber(state.noise)}</div>
        <div>DP: {formatNumber(state.dp)}</div>
        <div>Relays: {formatNumber(state.relays)}</div>
        <div>Passive DP/s: {formatNumber(passiveDpPerSecond)}</div>
      </div>

      <div className="tabs">
        {tabs.map((tab) => {
          const hasAttention =
            (tab === 'Generators' && hasAffordableGenerator) ||
            (tab === 'Upgrades' && hasAffordableSignalOrRelayUpgrade) ||
            (tab === 'DP Upgrades' && hasAffordableDpUpgrade) ||
            (tab === 'Findings' && hasClaimableFinding) ||
            (tab === 'Prestige' && canPrestigeNow);
          return <TabButton key={tab} tab={tab} active={state.currentTab === tab} hasAttention={hasAttention} onClick={(t) => dispatch({ type: 'SET_TAB', tab: t })} />;
        })}
      </div>

      {state.currentTab === 'Control' && (
        <div className="panel">
          <h3>Control Console</h3>
          <button className="big" onClick={() => dispatch({ type: 'MANUAL_SCAN' })}>Manual Scan +{formatNumber(clickPower)} Signal</button>
          <p className="muted">Use scans to bootstrap, then lean on passive production. Noise rises with infrastructure and dampens output.</p>
          <label>
            <input type="checkbox" checked={state.autoBuyEnabled} onChange={() => dispatch({ type: 'TOGGLE_AUTO_BUY' })} disabled={!unlockedBuyMax} /> Auto-Buy Generators (requires Batch Procurement)
          </label>
          {unlockedBuyMax && (
            <div>
              Preferred buy amount:
              {[1, 10, 'max'].map((amt) => (
                <button key={amt} onClick={() => dispatch({ type: 'SET_BUY_AMOUNT', amount: amt as 1 | 10 | 'max' })}>{amt}</button>
              ))}
            </div>
          )}
        </div>
      )}

      {state.currentTab === 'Generators' && renderGenerators()}
      {state.currentTab === 'Upgrades' && renderUpgrades('Upgrades', ['signal', 'relays'])}
      {state.currentTab === 'DP Upgrades' && renderUpgrades('DP Upgrades', ['dp'])}
      {state.currentTab === 'Findings' && renderFindings()}
      {state.currentTab === 'Prestige' && renderPrestige()}
      {state.currentTab === 'Stats' && (
        <div className="panel">
          <h3>Stats & Save Tools</h3>
          <div>Total Signal Earned: {formatNumber(state.totalSignalEarned)}</div>
          <div>Session Length: {Math.floor((Date.now() - state.startedAt) / 1000)} sec</div>
          <div>Last Save: {new Date(state.lastSaveAt).toLocaleTimeString()}</div>
          <div className="actions">
            <button onClick={runManualSave}>Manual Save</button>
            <button onClick={hardReset}>Hard Reset</button>
          </div>
          <div>
            <button onClick={() => setExportText(exportSave(state))}>Export Save</button>
            <textarea value={exportText} onChange={(e) => setExportText(e.target.value)} rows={3} />
          </div>
          <div>
            <button onClick={handleImport}>Import Save</button>
            <textarea value={importText} onChange={(e) => setImportText(e.target.value)} rows={3} placeholder="Paste save JSON" />
          </div>
          <div>
            Prestige reset sanity: {verifyPrestigeReset(state) ? 'OK' : 'Check failed'}
            {sanityIssues.length > 0 && <pre>{sanityIssues.join('\n')}</pre>}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
