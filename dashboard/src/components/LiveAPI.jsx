import { useState, useEffect, useRef, useCallback } from 'react';
import {
  generateSyntheticScenario,
  generateBatchScenario,
  runMatchingPipeline,
  runBatchAssignment,
  callMatchAPI,
  callBatchAPI,
  checkAPIHealth,
  exportToJSON,
} from '../data';
import { updateUrlHash } from '../utils/urlState';
import { Terminal, Copy, Check, Download } from 'lucide-react';

export default function LiveAPI() {
  const [apiUrl, setApiUrl] = useState('http://127.0.0.1:8000');
  const [endpoint, setEndpoint] = useState('matches'); // 'matches' | 'assignments'
  const [health, setHealth] = useState(null);
  const [polling, setPolling] = useState(false);
  const [seed, setSeed] = useState(42);
  const [riderCount, setRiderCount] = useState(6);
  const [driverCount, setDriverCount] = useState(12);
  const [topK, setTopK] = useState(3);
  const [batchMethod, setBatchMethod] = useState('greedy');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [requestLog, setRequestLog] = useState([]);
  const [useLocalFallback, setUseLocalFallback] = useState(false);
  const [copiedCurl, setCopiedCurl] = useState(false);
  const [copiedResponse, setCopiedResponse] = useState(false);
  const pollRef = useRef(null);

  // Sync hash
  useEffect(() => {
    updateUrlHash('api', { endpoint }, true);
  }, [endpoint]);

  const checkHealth = useCallback(async () => {
    const h = await checkAPIHealth(apiUrl);
    setHealth(h);
    return h;
  }, [apiUrl]);

  useEffect(() => {
    let ignore = false;
    checkAPIHealth(apiUrl).then((h) => {
      if (!ignore) setHealth(h);
    });
    return () => { ignore = true; };
  }, [apiUrl]);

  useEffect(() => {
    if (polling) {
      pollRef.current = setInterval(() => {
        checkAPIHealth(apiUrl).then((h) => setHealth(h));
      }, 5000);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [polling, apiUrl]);

  const sendRequest = useCallback(async () => {
    setLoading(true);
    setError(null);
    const t0 = performance.now();
    try {
      let res;
      if (endpoint === 'matches') {
        const { rider, drivers } = generateSyntheticScenario(seed, driverCount);
        if (useLocalFallback) {
          const pipeline = runMatchingPipeline(rider, drivers);
          res = {
            api_version: 'client-simulator-v1',
            rank_method: 'route_time_heuristic',
            top_k: topK,
            retrieved_count: pipeline.retrieved_count,
            eligible_count: pipeline.eligible.length,
            recommendations: pipeline.eligible.slice(0, topK).map((d, idx) => ({
              driver_id: d.driver_id,
              rank: idx + 1,
              score: d.score / 100.0,
              explanation: {
                features: d.features,
                reasons: ['passed all mandatory feasibility checks'],
              },
            })),
            feasibility_matrix: pipeline.all.map((d) => ({
              driver_id: d.driver_id,
              final_eligible: d.final_eligible,
              checks: d.checks,
              features: d.features,
              score: d.score,
              rejection_reasons: d.rejection_reasons,
            })),
            timing_seconds: { retrieval: 0.001, features: 0.002, filtering: 0.001 },
          };
        } else {
          res = await callMatchAPI(apiUrl, rider, drivers, topK);
        }
        const latency = Math.round(performance.now() - t0);
        setResult({ type: 'matches', ...res });
        setRequestLog((prev) => [
          {
            timestamp: new Date().toISOString(),
            endpoint: useLocalFallback ? '/v1/matches (client sim)' : '/v1/matches',
            seed,
            driverCount,
            latencyMs: latency,
            status: 'ok',
            summary: `${res.eligible_count} eligible (${res.rank_method})`,
          },
          ...prev.slice(0, 49),
        ]);
      } else {
        const { riders, drivers } = generateBatchScenario(seed, riderCount, driverCount);
        if (useLocalFallback) {
          const batchRes = runBatchAssignment(riders, drivers, batchMethod);
          res = {
            api_version: 'client-simulator-v1',
            method: batchMethod,
            matched_rider_count: batchRes.matchedRiders,
            matched_driver_count: batchRes.matchedDrivers,
            objective_value: batchRes.objectiveValue,
            total_pairs: batchRes.totalPairs,
            feasible_edges: batchRes.feasibleEdges,
            unmatched_rider_ids: batchRes.unmatchedRiders,
            unmatched_driver_ids: batchRes.unmatchedDrivers,
            groups: batchRes.groups.map((g) => ({
              driver_id: g.driver_id,
              rider_ids: g.rider_ids,
              seats_used: g.seatsUsed,
              remaining_capacity: g.remainingCapacity,
              group_score: g.groupScore,
            })),
            timing_seconds: { graph: batchRes.graphMs / 1000.0, solve: batchRes.solveMs / 1000.0 },
          };
        } else {
          res = await callBatchAPI(apiUrl, riders, drivers, batchMethod);
        }
        const latency = Math.round(performance.now() - t0);
        setResult({ type: 'assignments', ...res });
        setRequestLog((prev) => [
          {
            timestamp: new Date().toISOString(),
            endpoint: useLocalFallback ? '/v1/assignments (client sim)' : '/v1/assignments',
            seed,
            driverCount: `${riderCount}R / ${driverCount}D`,
            latencyMs: latency,
            status: 'ok',
            summary: `${res.matched_rider_count}/${riderCount} matched (${res.method})`,
          },
          ...prev.slice(0, 49),
        ]);
      }
    } catch (e) {
      const latency = Math.round(performance.now() - t0);
      setError(e.message);
      setRequestLog((prev) => [
        {
          timestamp: new Date().toISOString(),
          endpoint: endpoint === 'matches' ? '/v1/matches' : '/v1/assignments',
          seed,
          driverCount: endpoint === 'matches' ? driverCount : `${riderCount}R / ${driverCount}D`,
          latencyMs: latency,
          status: 'error',
          summary: e.message,
        },
        ...prev.slice(0, 49),
      ]);
    } finally {
      setLoading(false);
    }
  }, [apiUrl, endpoint, seed, riderCount, driverCount, topK, batchMethod, useLocalFallback]);

  return (
    <div className="animate-in" id="live-api-view">
      <div className="section-header">
        <h2 className="section-title">Live API Integration & Workbench</h2>
        <p className="section-desc">
          Test real-time HTTP dispatch endpoints for 1-to-N matching and multi-rider combinatorial batch pooling.
          Start the local FastAPI server with{' '}
          <code style={{ background: 'var(--bg-hover)', padding: '2px 6px', borderRadius: '4px', color: '#38bdf8', fontSize: '0.75rem', border: '1px solid var(--border-subtle)' }}>
            py -m routemate.api --port 8000
          </code>
        </p>
      </div>

      {/* Offline Notice Banner */}
      {!health?.online && (
        <div style={{ background: 'var(--accent-danger-subtle)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 'var(--radius-sm)', padding: '12px 14px', marginBottom: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <div>
              <div style={{ fontWeight: 600, color: '#f87171', fontSize: '0.8125rem', marginBottom: '2px' }}>
                Backend API Server is Offline ({apiUrl})
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Start the backend server or toggle In-Browser Simulator mode to execute matching logic client-side.
              </div>
            </div>
            <button
              className={`btn btn-sm ${useLocalFallback ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setUseLocalFallback(!useLocalFallback)}
            >
              {useLocalFallback ? 'In-Browser Simulator Active' : 'Enable In-Browser Engine'}
            </button>
          </div>
        </div>
      )}

      {/* Connection panel */}
      <div className="card" style={{ marginBottom: '18px' }}>
        <div className="card-header">
          <span className="card-title">Endpoint Connection Status</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div className={`status-dot ${health?.online ? 'online' : 'offline'}`} />
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: health?.online ? '#34d399' : '#f87171', fontFamily: 'var(--font-mono)' }}>
              {health?.online ? `ONLINE (${health.api_version || 'v1'})` : health?.error || 'OFFLINE'}
            </span>
          </div>
        </div>
        <div className="card-body">
          <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div className="form-group" style={{ flex: 1, minWidth: '220px' }}>
              <label className="form-label">Base URL</label>
              <input
                className="form-input"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                placeholder="http://127.0.0.1:8000"
              />
            </div>
            <button className="btn btn-outline" onClick={checkHealth}>
              Check Health
            </button>
            <button
              className={`btn ${polling ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setPolling(!polling)}
            >
              {polling ? 'Stop Polling' : 'Auto-Poll (5s)'}
            </button>
            <button
              className={`btn btn-sm ${useLocalFallback ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setUseLocalFallback(!useLocalFallback)}
              title="Execute matching logic inside the browser without HTTP backend"
            >
              {useLocalFallback ? 'Client Engine: Active' : 'Client Engine: Inactive'}
            </button>
          </div>
        </div>
      </div>

      <div className="grid-2">
        {/* Request panel */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Request Configuration</span>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                className={`btn btn-sm ${endpoint === 'matches' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setEndpoint('matches')}
              >
                POST /v1/matches
              </button>
              <button
                className={`btn btn-sm ${endpoint === 'assignments' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setEndpoint('assignments')}
              >
                POST /v1/assignments
              </button>
            </div>
          </div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <div className="form-group">
                <label className="form-label">Seed</label>
                <input
                  className="form-input"
                  type="number"
                  value={seed}
                  onChange={(e) => setSeed(parseInt(e.target.value, 10) || 0)}
                  style={{ width: '80px' }}
                />
              </div>

              {endpoint === 'assignments' && (
                <div className="form-group">
                  <label className="form-label">Riders</label>
                  <select
                    className="form-select"
                    value={riderCount}
                    onChange={(e) => setRiderCount(parseInt(e.target.value, 10))}
                  >
                    {[4, 6, 8, 12, 16].map((n) => (
                      <option key={n} value={n}>{n} riders</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Drivers</label>
                <select
                  className="form-select"
                  value={driverCount}
                  onChange={(e) => setDriverCount(parseInt(e.target.value, 10))}
                >
                  {[4, 8, 12, 16, 24].map((n) => (
                    <option key={n} value={n}>{n} drivers</option>
                  ))}
                </select>
              </div>

              {endpoint === 'matches' ? (
                <div className="form-group">
                  <label className="form-label">Top-K</label>
                  <select
                    className="form-select"
                    value={topK}
                    onChange={(e) => setTopK(parseInt(e.target.value, 10))}
                  >
                    {[1, 3, 5, 10].map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="form-group">
                  <label className="form-label">Solver</label>
                  <select
                    className="form-select"
                    value={batchMethod}
                    onChange={(e) => setBatchMethod(e.target.value)}
                  >
                    <option value="greedy">Greedy Priority</option>
                    <option value="auction">Auction Swap</option>
                    <option value="optimal">Branch-and-Bound (Exact)</option>
                  </select>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                className="btn btn-primary"
                onClick={sendRequest}
                disabled={loading || (!health?.online && !useLocalFallback)}
              >
                {loading ? 'Dispatching…' : `Dispatch to ${endpoint === 'matches' ? '/v1/matches' : '/v1/assignments'}`}
              </button>
              <button
                className="btn btn-outline"
                onClick={() => setSeed(Math.floor(Math.random() * 1000))}
              >
                Random Seed
              </button>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => {
                  const curlCmd = endpoint === 'matches'
                    ? `curl -X POST "${apiUrl}/v1/matches" -H "Content-Type: application/json" -d '{"rider": {"journey_id":"rider-${seed}","start":{"latitude":31.3260,"longitude":75.5762},"destination":{"latitude":31.2536,"longitude":75.7037},"departure":"2026-10-09T08:30:00Z","route":[],"seats_requested":1},"drivers":[],"top_k":${topK}}'`
                    : `curl -X POST "${apiUrl}/v1/assignments" -H "Content-Type: application/json" -d '{"riders":[],"drivers":[],"method":"${batchMethod}"}'`;
                  navigator.clipboard.writeText(curlCmd);
                  setCopiedCurl(true);
                  setTimeout(() => setCopiedCurl(false), 2000);
                }}
                title="Copy request as cURL command line"
              >
                {copiedCurl ? <Check size={14} className="text-success" /> : <Terminal size={14} />}
                <span>{copiedCurl ? 'cURL Copied' : 'Copy cURL'}</span>
              </button>
            </div>

            {error && (
              <div className="rejection-reasons">
                <div style={{ fontSize: '0.75rem', fontWeight: 600, marginBottom: '2px' }}>Request Error</div>
                <div style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>{error}</div>
              </div>
            )}
          </div>
        </div>

        {/* Response panel */}
        <div className="card">
          <div className="card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="card-title">Response Payload</span>
              {(useLocalFallback || result?.api_version === 'client-simulator-v1') && (
                <span className="badge warning sim-badge">Simulated Response</span>
              )}
            </div>
            {result && (
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => {
                    navigator.clipboard.writeText(JSON.stringify(result, null, 2));
                    setCopiedResponse(true);
                    setTimeout(() => setCopiedResponse(false), 2000);
                  }}
                >
                  {copiedResponse ? <Check size={13} className="text-success" /> : <Copy size={13} />}
                  <span>{copiedResponse ? 'Copied' : 'Copy JSON'}</span>
                </button>
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => exportToJSON(result, `api_response_${result.type}_seed${seed}.json`)}
                >
                  <Download size={13} />
                  <span>Export</span>
                </button>
              </div>
            )}
          </div>
          <div className="card-body">
            {result ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {result.type === 'matches' ? (
                  <>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                      <div className="stat-card indigo" style={{ padding: '8px 12px' }}>
                        <div className="stat-label">Method</div>
                        <div style={{ fontSize: '0.875rem', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{result.rank_method}</div>
                      </div>
                      <div className="stat-card cyan" style={{ padding: '8px 12px' }}>
                        <div className="stat-label">Retrieved</div>
                        <div style={{ fontSize: '0.875rem', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{result.retrieved_count}</div>
                      </div>
                      <div className="stat-card green" style={{ padding: '8px 12px' }}>
                        <div className="stat-label">Eligible</div>
                        <div style={{ fontSize: '0.875rem', fontWeight: 600, fontFamily: 'var(--font-mono)', color: '#34d399' }}>{result.eligible_count}</div>
                      </div>
                    </div>

                    {result.recommendations?.length > 0 && (
                      <div>
                        <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
                          Top Ranked Recommendations
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {result.recommendations.map((rec) => (
                            <div key={rec.driver_id} style={{
                              padding: '8px 10px',
                              background: 'var(--bg-hover)',
                              borderRadius: 'var(--radius-xs)',
                              border: '1px solid var(--border-subtle)',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                            }}>
                              <span style={{ fontWeight: 600, fontSize: '0.8125rem', fontFamily: 'var(--font-mono)' }}>
                                #{rec.rank} {rec.driver_id}
                              </span>
                              <span style={{
                                fontWeight: 700,
                                fontSize: '0.875rem',
                                fontFamily: 'var(--font-mono)',
                                color: rec.score >= 0.7 ? '#34d399' : rec.score >= 0.5 ? '#fbbf24' : '#f87171',
                              }}>
                                {typeof rec.score === 'number' && rec.score <= 1
                                  ? (rec.score * 100).toFixed(1)
                                  : rec.score?.toFixed?.(1)} pts
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                      <div className="stat-card indigo" style={{ padding: '8px 12px' }}>
                        <div className="stat-label">Method</div>
                        <div style={{ fontSize: '0.875rem', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{result.method}</div>
                      </div>
                      <div className="stat-card green" style={{ padding: '8px 12px' }}>
                        <div className="stat-label">Matched Riders</div>
                        <div style={{ fontSize: '0.875rem', fontWeight: 600, fontFamily: 'var(--font-mono)', color: '#34d399' }}>{result.matched_rider_count}</div>
                      </div>
                      <div className="stat-card cyan" style={{ padding: '8px 12px' }}>
                        <div className="stat-label">Vehicles Used</div>
                        <div style={{ fontSize: '0.875rem', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{result.matched_driver_count}</div>
                      </div>
                      <div className="stat-card amber" style={{ padding: '8px 12px' }}>
                        <div className="stat-label">Objective Value</div>
                        <div style={{ fontSize: '0.875rem', fontWeight: 600, fontFamily: 'var(--font-mono)', color: '#fbbf24' }}>{result.objective_value}</div>
                      </div>
                    </div>

                    {result.groups?.length > 0 ? (
                      <div>
                        <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
                          Formed Vehicle Pools ({result.groups.length})
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {result.groups.map((g) => (
                            <div key={g.driver_id} style={{
                              padding: '8px 10px',
                              background: 'var(--bg-hover)',
                              borderRadius: 'var(--radius-xs)',
                              border: '1px solid var(--border-subtle)',
                            }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontWeight: 600, fontSize: '0.8125rem', fontFamily: 'var(--font-mono)' }}>
                                  {g.driver_id} ({g.seats_used} seats allocated)
                                </span>
                                <span className="badge success">Score: {g.group_score}</span>
                              </div>
                              <div style={{ fontSize: '0.725rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                                Assigned Riders: {g.rider_ids.join(', ')}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No vehicle pools formed.</div>
                    )}
                  </>
                )}

                {/* Timing */}
                {result.timing_seconds && (
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {Object.entries(result.timing_seconds).map(([k, v]) => (
                      <span key={k} className="badge info" style={{ fontSize: '10px' }}>
                        {k}: {(v * 1000).toFixed(1)}ms
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="empty-state">
                <svg className="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                </svg>
                <div className="empty-state-text">No Response Payload</div>
                <div className="empty-state-hint">
                  {health?.online
                    ? 'Click Dispatch above to inspect live backend response'
                    : 'Enable in-browser simulator or launch FastAPI backend'}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Request log */}
      {requestLog.length > 0 && (
        <div className="card" style={{ marginTop: '18px' }}>
          <div className="card-header">
            <span className="card-title">Request Execution Log</span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <span className="badge info">{requestLog.length} calls</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setRequestLog([])}>
                Clear Log
              </button>
            </div>
          </div>
          <div className="card-body" style={{ maxHeight: '240px', overflowY: 'auto', padding: 0 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Endpoint</th>
                  <th>Seed</th>
                  <th>Scope</th>
                  <th>Status</th>
                  <th>Summary</th>
                  <th>Latency</th>
                </tr>
              </thead>
              <tbody>
                {requestLog.map((log, i) => (
                  <tr key={i}>
                    <td style={{ fontSize: '0.7rem', fontFamily: 'var(--font-mono)' }}>
                      {log.timestamp.split('T')[1]?.slice(0, 12)}
                    </td>
                    <td>
                      <span className="badge info" style={{ fontSize: '10px' }}>
                        {log.endpoint}
                      </span>
                    </td>
                    <td>{log.seed}</td>
                    <td>{log.driverCount}</td>
                    <td>
                      <span className={`badge ${log.status === 'ok' ? 'success' : 'danger'}`} style={{ fontSize: '10px' }}>
                        {log.status.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.75rem' }}>{log.summary}</td>
                    <td style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{log.latencyMs}ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
