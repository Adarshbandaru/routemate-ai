import { useState, useEffect, useRef, useCallback } from 'react';
import {
  generateSyntheticScenario,
  generateBatchScenario,
  callMatchAPI,
  callBatchAPI,
  checkAPIHealth,
  exportToJSON,
} from '../data';

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
  const pollRef = useRef(null);

  const checkHealth = useCallback(async () => {
    const h = await checkAPIHealth(apiUrl);
    setHealth(h);
    return h;
  }, [apiUrl]);

  useEffect(() => {
    checkHealth();
  }, [checkHealth]);

  useEffect(() => {
    if (polling) {
      pollRef.current = setInterval(() => checkHealth(), 5000);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [polling, checkHealth]);

  const sendRequest = useCallback(async () => {
    setLoading(true);
    setError(null);
    const t0 = performance.now();
    try {
      let res;
      if (endpoint === 'matches') {
        const { rider, drivers } = generateSyntheticScenario(seed, driverCount);
        res = await callMatchAPI(apiUrl, rider, drivers, topK);
        const latency = Math.round(performance.now() - t0);
        setResult({ type: 'matches', ...res });
        setRequestLog((prev) => [
          {
            timestamp: new Date().toISOString(),
            endpoint: '/v1/matches',
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
        res = await callBatchAPI(apiUrl, riders, drivers, batchMethod);
        const latency = Math.round(performance.now() - t0);
        setResult({ type: 'assignments', ...res });
        setRequestLog((prev) => [
          {
            timestamp: new Date().toISOString(),
            endpoint: '/v1/assignments',
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
  }, [apiUrl, endpoint, seed, riderCount, driverCount, topK, batchMethod]);

  return (
    <div className="animate-in" id="live-api-view">
      <div className="section-header">
        <h2 className="section-title">🔌 Live API Integration</h2>
        <p className="section-desc">
          Connect to the RouteMate Python HTTP API for real-time 1-to-N matching and multi-rider batch assignment.
          Start the local server with{' '}
          <code style={{ background: 'rgba(99,102,241,0.1)', padding: '2px 6px', borderRadius: '4px', color: '#818cf8', fontSize: '0.75rem' }}>
            py -m routemate.api
          </code>
        </p>
      </div>

      {/* Connection panel */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div className="card-header">
          <span className="card-title">🌐 Connection Status</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div className={`status-dot ${health?.online ? 'online' : 'offline'}`} />
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: health?.online ? '#10b981' : '#ef4444' }}>
              {health?.online ? `Online (${health.api_version || 'v1'})` : health?.error || 'Offline'}
            </span>
          </div>
        </div>
        <div className="card-body">
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div className="form-group" style={{ flex: 1, minWidth: '220px' }}>
              <label className="form-label">Base API URL</label>
              <input
                className="form-input"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                placeholder="http://127.0.0.1:8000"
              />
            </div>
            <button className="btn btn-ghost" onClick={checkHealth}>
              🔄 Check Health
            </button>
            <button
              className={`btn ${polling ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setPolling(!polling)}
            >
              {polling ? '⏸️ Stop Auto-Poll' : '📡 Auto-Poll (5s)'}
            </button>
          </div>
        </div>
      </div>

      <div className="grid-2">
        {/* Request panel */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">📤 Dispatch Request</span>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                className={`btn btn-sm ${endpoint === 'matches' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setEndpoint('matches')}
              >
                /v1/matches
              </button>
              <button
                className={`btn btn-sm ${endpoint === 'assignments' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setEndpoint('assignments')}
              >
                /v1/assignments
              </button>
            </div>
          </div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <div className="form-group">
                <label className="form-label">Seed</label>
                <input
                  className="form-input"
                  type="number"
                  value={seed}
                  onChange={(e) => setSeed(parseInt(e.target.value, 10) || 0)}
                  style={{ width: '85px' }}
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
                  <label className="form-label">Top K</label>
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
                  <label className="form-label">Algorithm</label>
                  <select
                    className="form-select"
                    value={batchMethod}
                    onChange={(e) => setBatchMethod(e.target.value)}
                  >
                    <option value="greedy">Greedy Priority</option>
                    <option value="auction">Auction Swap</option>
                    <option value="optimal">Branch-and-Bound (Optimal)</option>
                  </select>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                className="btn btn-primary"
                onClick={sendRequest}
                disabled={loading || !health?.online}
              >
                {loading ? (
                  <>
                    <div className="spinner" style={{ width: '14px', height: '14px' }} /> Sending…
                  </>
                ) : (
                  `🚀 Send to ${endpoint === 'matches' ? '/v1/matches' : '/v1/assignments'}`
                )}
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => setSeed(Math.floor(Math.random() * 1000))}
              >
                🎲 Random Seed
              </button>
            </div>

            {error && (
              <div className="rejection-reasons">
                <div style={{ fontSize: '0.75rem', fontWeight: 600, marginBottom: '4px' }}>Request Error</div>
                <div style={{ fontSize: '0.8125rem' }}>{error}</div>
              </div>
            )}
          </div>
        </div>

        {/* Response panel */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">📥 API Response</span>
            {result && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => exportToJSON(result, `api_response_${result.type}_seed${seed}.json`)}
              >
                💾 Export JSON
              </button>
            )}
          </div>
          <div className="card-body">
            {result ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {result.type === 'matches' ? (
                  <>
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                      <div className="mini-stat">
                        <span className="mini-stat-label">Rank Method</span>
                        <span className="mini-stat-value" style={{ color: '#818cf8' }}>
                          {result.rank_method}
                        </span>
                      </div>
                      <div className="mini-stat">
                        <span className="mini-stat-label">Retrieved</span>
                        <span className="mini-stat-value">{result.retrieved_count}</span>
                      </div>
                      <div className="mini-stat">
                        <span className="mini-stat-label">Eligible</span>
                        <span className="mini-stat-value" style={{ color: '#10b981' }}>
                          {result.eligible_count}
                        </span>
                      </div>
                    </div>

                    {result.recommendations?.length > 0 && (
                      <div>
                        <div style={{ fontSize: '0.6875rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
                          Top Ranked Recommendations
                        </div>
                        {result.recommendations.map((rec) => (
                          <div key={rec.driver_id} className="recommendation-card">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontWeight: 600, fontSize: '0.8125rem' }}>
                                #{rec.rank} {rec.driver_id}
                              </span>
                              <span style={{
                                fontWeight: 700,
                                fontSize: '0.875rem',
                                color: rec.score >= 0.7 ? '#10b981' : rec.score >= 0.5 ? '#f59e0b' : '#ef4444',
                              }}>
                                {typeof rec.score === 'number' && rec.score <= 1
                                  ? (rec.score * 100).toFixed(1)
                                  : rec.score?.toFixed?.(1)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                      <div className="mini-stat">
                        <span className="mini-stat-label">Method</span>
                        <span className="mini-stat-value" style={{ color: '#818cf8', textTransform: 'capitalize' }}>
                          {result.method}
                        </span>
                      </div>
                      <div className="mini-stat">
                        <span className="mini-stat-label">Matched Riders</span>
                        <span className="mini-stat-value" style={{ color: '#10b981' }}>
                          {result.matched_rider_count}
                        </span>
                      </div>
                      <div className="mini-stat">
                        <span className="mini-stat-label">Drivers Used</span>
                        <span className="mini-stat-value">{result.matched_driver_count}</span>
                      </div>
                      <div className="mini-stat">
                        <span className="mini-stat-label">Objective Value</span>
                        <span className="mini-stat-value" style={{ color: '#f59e0b' }}>
                          {result.objective_value}
                        </span>
                      </div>
                    </div>

                    {result.groups?.length > 0 ? (
                      <div>
                        <div style={{ fontSize: '0.6875rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
                          Formed Vehicle Groups ({result.groups.length})
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {result.groups.map((g) => (
                            <div key={g.driver_id} className="recommendation-card">
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontWeight: 600, fontSize: '0.8125rem' }}>
                                  🚐 {g.driver_id} ({g.seats_used} seats used)
                                </span>
                                <span className="badge success">Score: {g.group_score}</span>
                              </div>
                              <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '4px' }}>
                                Assigned Riders: {g.rider_ids.join(', ')}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>No vehicle groups formed.</div>
                    )}
                  </>
                )}

                {/* Timing */}
                {result.timing_seconds && (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {Object.entries(result.timing_seconds).map(([k, v]) => (
                      <span key={k} className="badge info" style={{ fontSize: '10px' }}>
                        {k}: {(v * 1000).toFixed(1)}ms
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="empty-state" style={{ padding: '32px 16px' }}>
                <div className="empty-state-icon">📡</div>
                <div className="empty-state-text">No Response Yet</div>
                <div className="empty-state-hint">
                  {health?.online
                    ? 'Click Send Request above to inspect live backend output'
                    : 'Launch py -m routemate.api to connect the live backend'}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Request log */}
      {requestLog.length > 0 && (
        <div className="card" style={{ marginTop: '24px' }}>
          <div className="card-header">
            <span className="card-title">📜 Request History</span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <span className="badge info">{requestLog.length} requests</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setRequestLog([])}>
                Clear
              </button>
            </div>
          </div>
          <div className="card-body" style={{ maxHeight: '250px', overflowY: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Time</th>
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
                    <td style={{ fontSize: '0.6875rem', fontFamily: "'Courier New', monospace" }}>
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
                        {log.status}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.75rem' }}>{log.summary}</td>
                    <td style={{ fontWeight: 600 }}>{log.latencyMs}ms</td>
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
