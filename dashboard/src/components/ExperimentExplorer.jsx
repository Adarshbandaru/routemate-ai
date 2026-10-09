import { useState, useMemo, useCallback } from 'react';
import { EXPERIMENT_DATA, exportToCSV } from '../data';

const METRIC_COLORS = {
  precision: 'purple',
  recall: 'cyan',
  ndcg: 'green',
};

const METHOD_COLORS = {
  seeded_random: '#64748b',
  nearest_neighbour: '#06b6d4',
  distance_destination: '#8b5cf6',
  route_time: '#10b981',
  ml_logistic: '#f59e0b',
  full: '#6366f1',
  route_removed: '#ec4899',
  temporal_removed: '#f97316',
  context_removed: '#64748b',
  control: '#10b981',
  endpoints_100m: '#06b6d4',
  route_100m: '#8b5cf6',
  departure_5min: '#f59e0b',
  availability_25pct: '#ef4444',
  euclidean: '#64748b',
  dijkstra_graph: '#10b981',
  greedy: '#64748b',
  auction: '#06b6d4',
  optimal: '#10b981',
};

function BarChart({ data, metric, maxValue = 1, highlightBest = true }) {
  const color = METRIC_COLORS[metric] || 'purple';
  const bestValue = highlightBest ? Math.max(...data.map((r) => r[metric] || 0)) : null;

  return (
    <div className="bar-chart">
      {data.map((row, i) => {
        const val = row[metric];
        if (val === undefined) return null;
        const pct = Math.max(0, Math.min(100, (val / maxValue) * 100));
        const isBest = highlightBest && val === bestValue;
        const methodColor = METHOD_COLORS[row.method] || null;

        return (
          <div key={i} className="bar-row">
            <span className="bar-label" title={`${row.scenario} / ${row.method}`}>
              <span style={{ color: methodColor || 'inherit' }}>●</span>{' '}
              {row.scenario} · {row.method}
            </span>
            <div className="bar-track">
              <div
                className={`bar-fill ${color}`}
                style={{
                  width: `${pct}%`,
                  ...(isBest ? { boxShadow: `0 0 8px rgba(16, 185, 129, 0.4)` } : {}),
                }}
              >
                <span className="bar-value">{val.toFixed(4)}</span>
              </div>
            </div>
            {isBest && <span className="badge success" style={{ fontSize: '9px', padding: '1px 6px', marginLeft: '4px' }}>Best</span>}
          </div>
        );
      })}
    </div>
  );
}

function RadarChart({ data, metrics, size = 200 }) {
  const cx = size / 2, cy = size / 2, r = size / 2 - 30;
  const n = metrics.length;
  const colors = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#ec4899'];

  // Group by method
  const methods = [...new Set(data.map((d) => d.method))];

  function getPoint(i, value) {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2;
    return { x: cx + r * value * Math.cos(angle), y: cy + r * value * Math.sin(angle) };
  }

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="radar-chart">
      {/* Grid */}
      {[0.25, 0.5, 0.75, 1].map((level) => (
        <polygon key={level}
          points={metrics.map((_, i) => { const p = getPoint(i, level); return `${p.x},${p.y}`; }).join(' ')}
          fill="none" stroke="rgba(148,163,184,0.15)" strokeWidth="1" />
      ))}
      {/* Axes */}
      {metrics.map((m, i) => {
        const p = getPoint(i, 1);
        const labelP = getPoint(i, 1.2);
        return (
          <g key={m}>
            <line x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="rgba(148,163,184,0.2)" strokeWidth="1" />
            <text x={labelP.x} y={labelP.y} fill="#94a3b8" fontSize="10" textAnchor="middle" dominantBaseline="middle">
              {m === 'precision' ? 'P@3' : m === 'recall' ? 'R@3' : m === 'ndcg' ? 'NDCG' : m}
            </text>
          </g>
        );
      })}
      {/* Data polygons */}
      {methods.map((method, mIdx) => {
        const methodData = data.filter((d) => d.method === method);
        if (!methodData.length) return null;
        const avgValues = metrics.map((m) => {
          const vals = methodData.map((d) => d[m]).filter((v) => v !== undefined);
          return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
        });
        const points = avgValues.map((v, i) => getPoint(i, v)).map((p) => `${p.x},${p.y}`).join(' ');
        const color = METHOD_COLORS[method] || colors[mIdx % colors.length];
        return (
          <g key={method}>
            <polygon points={points} fill={`${color}20`} stroke={color} strokeWidth="2" />
            {avgValues.map((v, i) => {
              const p = getPoint(i, v);
              return <circle key={i} cx={p.x} cy={p.y} r="3" fill={color} />;
            })}
          </g>
        );
      })}
    </svg>
  );
}

function HeatmapView({ data, metric }) {
  const scenarios = [...new Set(data.map((r) => r.scenario))];
  const methods = [...new Set(data.map((r) => r.method))];
  const maxVal = Math.max(...data.map((r) => r[metric] || 0));

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="data-table heatmap-table">
        <thead>
          <tr>
            <th></th>
            {methods.map((m) => (
              <th key={m} style={{ fontSize: '0.6875rem', whiteSpace: 'nowrap' }}>
                <span style={{ color: METHOD_COLORS[m] || '#94a3b8' }}>●</span> {m}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {scenarios.map((scenario) => (
            <tr key={scenario}>
              <td><span className="badge info">{scenario}</span></td>
              {methods.map((method) => {
                const row = data.find((r) => r.scenario === scenario && r.method === method);
                const val = row?.[metric];
                if (val === undefined) return <td key={method}>—</td>;
                const intensity = val / maxVal;
                const bg = intensity > 0.8 ? 'rgba(16,185,129,0.2)' :
                  intensity > 0.6 ? 'rgba(6,182,212,0.15)' :
                  intensity > 0.4 ? 'rgba(99,102,241,0.1)' :
                  intensity > 0.2 ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.08)';
                return (
                  <td key={method} style={{ background: bg, fontWeight: 600, textAlign: 'center', fontSize: '0.8125rem' }}>
                    {val.toFixed(4)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ExperimentExplorer() {
  const [activeExp, setActiveExp] = useState('001_baseline');
  const [metric, setMetric] = useState('ndcg');
  const [scenario, setScenario] = useState('all');
  const [viewMode, setViewMode] = useState('chart'); // chart | table | heatmap | radar

  const exp = EXPERIMENT_DATA[activeExp];

  const scenarios = useMemo(
    () => (exp ? [...new Set(exp.results.map((r) => r.scenario))] : []),
    [exp]
  );

  const filtered = useMemo(
    () => (!exp ? [] : scenario === 'all' ? exp.results : exp.results.filter((r) => r.scenario === scenario)),
    [exp, scenario]
  );

  const hasQuality = exp?.results?.some((r) => r.quality !== undefined) ?? false;
  const hasCoverage = exp?.results?.some((r) => r.coverage !== undefined) ?? false;
  const hasLostAvail = exp?.results?.some((r) => r.lost_availability !== undefined) ?? false;

  const handleExport = useCallback(() => {
    if (!filtered.length) return;
    exportToCSV(filtered, `experiment_${activeExp}_${scenario}.csv`);
  }, [filtered, activeExp, scenario]);

  // Compute best method per scenario
  const bestMethods = useMemo(() => {
    if (!exp) return {};
    const best = {};
    scenarios.forEach((sc) => {
      const rows = exp.results.filter((r) => r.scenario === sc);
      const topNdcg = rows.reduce((a, b) => (b.ndcg || 0) > (a.ndcg || 0) ? b : a, rows[0]);
      best[sc] = topNdcg?.method;
    });
    return best;
  }, [exp, scenarios]);

  if (!exp) return null;

  return (
    <div className="animate-in" id="experiment-explorer">
      <div className="section-header">
        <h2 className="section-title">📊 Experiment Explorer</h2>
        <p className="section-desc">
          Compare ranking algorithms and routing methods across controlled synthetic benchmarks and road network experiments.
        </p>
      </div>

      {/* Experiment selector */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="experiment-selector">
          {Object.entries(EXPERIMENT_DATA).map(([key, val]) => (
            <button key={key}
              className={`experiment-chip ${activeExp === key ? 'active' : ''}`}
              onClick={() => { setActiveExp(key); setScenario('all'); }}>
              {val.name}
            </button>
          ))}
        </div>
      </div>

      {/* Road Network Summary Banner */}
      {exp.summary?.mean_circuity && (
        <div className="card animate-in" style={{ marginBottom: '24px', borderLeft: '4px solid #10b981' }}>
          <div className="card-header">
            <span className="card-title">🗺️ Road Network Circuity Benchmark Summary</span>
            <span className="badge success">30 OD Pairs Evaluated</span>
          </div>
          <div className="card-body">
            <div className="stats-grid" style={{ marginBottom: 0 }}>
              <div className="stat-card cyan">
                <div className="stat-label">Mean Circuity Factor</div>
                <div className="stat-value cyan">{exp.summary.mean_circuity}x</div>
                <div className="stat-detail">+34.1% road vs straight-line</div>
              </div>
              <div className="stat-card amber">
                <div className="stat-label">Max Circuity Factor</div>
                <div className="stat-value amber">{exp.summary.max_circuity}x</div>
                <div className="stat-detail">one-way street detour peak</div>
              </div>
              <div className="stat-card purple">
                <div className="stat-label">Road vs Euclidean Distance</div>
                <div className="stat-value purple">{exp.summary.mean_road_km} / {exp.summary.mean_euclidean_km} km</div>
                <div className="stat-detail">urban grid driving vs straight</div>
              </div>
              <div className="stat-card pink">
                <div className="stat-label">Detour Underestimation</div>
                <div className="stat-value pink">+{exp.summary.detour_underestimation_km} km</div>
                <div className="stat-detail">Euclidean systematically underestimates</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Assignment Scaling Summary Banner */}
      {exp.summary?.overall_greedy_gap_pct !== undefined && (
        <div className="card animate-in" style={{ marginBottom: '24px', borderLeft: '4px solid #06b6d4' }}>
          <div className="card-header">
            <span className="card-title">⚡ Multi-Rider Assignment Scaling & Optimality Summary</span>
            <span className="badge success">15 Cohort Instances Evaluated</span>
          </div>
          <div className="card-body">
            <div className="stats-grid" style={{ marginBottom: 0 }}>
              <div className="stat-card amber">
                <div className="stat-label">Mean Optimality Gap</div>
                <div className="stat-value amber">{exp.summary.overall_greedy_gap_pct}%</div>
                <div className="stat-detail">Greedy vs Exact B&B optimum</div>
              </div>
              <div className="stat-card green">
                <div className="stat-label">Auction-Swap Gap</div>
                <div className="stat-value green">{exp.summary.overall_auction_gap_pct}%</div>
                <div className="stat-detail">Local-search swap gap</div>
              </div>
              <div className="stat-card purple">
                <div className="stat-label">Max Tested Scale</div>
                <div className="stat-value purple">40R / 20D</div>
                <div className="stat-detail">{exp.summary.max_scale_explored}</div>
              </div>
              <div className="stat-card cyan">
                <div className="stat-label">Heuristic Speedup</div>
                <div className="stat-value cyan">{exp.summary.speedup_factor}</div>
                <div className="stat-detail">&lt;0.25ms vs &gt;4,800ms exact B&B</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Summary cards for best methods */}
      <div className="stats-grid animate-in" style={{ marginBottom: '24px' }}>
        {scenarios.map((sc, i) => (
          <div key={sc} className={`stat-card ${['purple', 'cyan', 'green', 'amber'][i % 4]} animate-in animate-in-delay-${i + 1}`}>
            <div className="stat-label">{sc}</div>
            <div className={`stat-value ${['purple', 'cyan', 'green', 'amber'][i % 4]}`}>
              {(exp.results.filter((r) => r.scenario === sc).reduce((a, b) => (b.ndcg || 0) > (a.ndcg || 0) ? b : a, exp.results[0])?.ndcg || 0).toFixed(3)}
            </div>
            <div className="stat-detail">best NDCG · {bestMethods[sc]}</div>
          </div>
        ))}
      </div>

      <div className="grid-2">
        {/* Controls */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">⚙️ Configuration</span>
          </div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="form-group">
              <label className="form-label">Metric</label>
              <select className="form-select" value={metric} onChange={(e) => setMetric(e.target.value)}>
                <option value="precision">Precision@3</option>
                <option value="recall">Recall@3</option>
                <option value="ndcg">NDCG@3</option>
                {hasQuality && <option value="quality">Quality</option>}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Scenario</label>
              <select className="form-select" value={scenario} onChange={(e) => setScenario(e.target.value)}>
                <option value="all">All scenarios</option>
                {scenarios.map((s) => (
                  <option key={s} value={s}>{s} ({exp.results.find(r => r.scenario === s)?.candidates || '?'} drivers)</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">View</label>
              <div className="experiment-selector" style={{ gap: '4px' }}>
                {[
                  { id: 'chart', label: '📊 Bars' },
                  { id: 'table', label: '📋 Table' },
                  { id: 'heatmap', label: '🔥 Heatmap' },
                  { id: 'radar', label: '🕸️ Radar' },
                ].map((v) => (
                  <button key={v.id}
                    className={`experiment-chip ${viewMode === v.id ? 'active' : ''}`}
                    onClick={() => setViewMode(v.id)}
                    style={{ fontSize: '11px', padding: '4px 10px' }}>
                    {v.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ padding: '12px', background: 'rgba(99,102,241,0.06)', borderRadius: '8px', border: '1px solid rgba(99,102,241,0.15)' }}>
              <div style={{ fontSize: '0.6875rem', color: '#94a3b8', marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>About</div>
              <p style={{ fontSize: '0.8125rem', color: '#64748b', lineHeight: 1.5, margin: 0 }}>{exp.description}</p>
            </div>

            <button className="btn btn-ghost" onClick={handleExport} style={{ alignSelf: 'flex-start' }}>
              📥 Export CSV
            </button>
          </div>
        </div>

        {/* Results */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              {viewMode === 'chart' ? '📈' : viewMode === 'table' ? '📋' : viewMode === 'heatmap' ? '🔥' : '🕸️'}{' '}
              {metric === 'precision' ? 'Precision@3' : metric === 'recall' ? 'Recall@3' : metric === 'ndcg' ? 'NDCG@3' : 'Quality'}
            </span>
            <span className="badge info">{filtered.length} rows</span>
          </div>
          <div className="card-body" style={{ overflowX: 'auto' }}>
            {viewMode === 'chart' && <BarChart data={filtered} metric={metric} />}
            {viewMode === 'table' && (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Scenario</th>
                    <th>Method</th>
                    <th>P@3</th>
                    <th>R@3</th>
                    <th>NDCG@3</th>
                    {hasQuality && <th>Quality</th>}
                    {hasCoverage && <th>Coverage</th>}
                    {hasLostAvail && <th>Lost Avail</th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row, i) => (
                    <tr key={i}>
                      <td><span className="badge info">{row.scenario}</span></td>
                      <td style={{ fontFamily: "'Courier New', monospace", fontSize: '0.8125rem' }}>
                        <span style={{ color: METHOD_COLORS[row.method] || '#94a3b8' }}>●</span> {row.method}
                      </td>
                      <td style={{ fontWeight: 600 }}>{row.precision?.toFixed(4)}</td>
                      <td style={{ fontWeight: 600 }}>{row.recall?.toFixed(4)}</td>
                      <td style={{
                        fontWeight: 600,
                        color: (row.ndcg || 0) > 0.6 ? '#10b981' : (row.ndcg || 0) > 0.45 ? '#f59e0b' : '#ef4444',
                      }}>
                        {row.ndcg?.toFixed(4)}
                      </td>
                      {hasQuality && <td style={{ fontWeight: 600 }}>{row.quality?.toFixed(4) ?? '—'}</td>}
                      {hasCoverage && <td>{row.coverage?.toFixed(4) ?? '—'}</td>}
                      {hasLostAvail && <td>{row.lost_availability?.toFixed(2) ?? '—'}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {viewMode === 'heatmap' && <HeatmapView data={filtered} metric={metric} />}
            {viewMode === 'radar' && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '16px' }}>
                <RadarChart data={filtered} metrics={['precision', 'recall', 'ndcg']} size={280} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Cross-experiment comparison */}
      <div className="card" style={{ marginTop: '24px' }}>
        <div className="card-header">
          <span className="card-title">🔬 Cross-Experiment Summary</span>
        </div>
        <div className="card-body">
          <table className="data-table">
            <thead>
              <tr>
                <th>Experiment</th>
                <th>Best Method (NDCG)</th>
                <th>Scenarios</th>
                <th>Max NDCG</th>
                <th>Avg NDCG</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(EXPERIMENT_DATA).map(([key, exp]) => {
                const allNdcg = exp.results.filter((r) => r.ndcg !== undefined);
                const maxNdcg = allNdcg.length ? Math.max(...allNdcg.map((r) => r.ndcg)) : 0;
                const avgNdcg = allNdcg.length ? allNdcg.reduce((s, r) => s + r.ndcg, 0) / allNdcg.length : 0;
                const bestRow = allNdcg.reduce((a, b) => (b.ndcg > a.ndcg ? b : a), allNdcg[0]);
                const scens = [...new Set(exp.results.map((r) => r.scenario))];
                return (
                  <tr key={key} style={key === activeExp ? { background: 'rgba(99,102,241,0.06)' } : {}}>
                    <td>
                      <button className="experiment-chip" style={{ fontSize: '11px', padding: '3px 8px' }}
                        onClick={() => { setActiveExp(key); setScenario('all'); }}>
                        {exp.name}
                      </button>
                    </td>
                    <td style={{ fontFamily: "'Courier New', monospace", fontSize: '0.8125rem' }}>
                      <span style={{ color: METHOD_COLORS[bestRow?.method] || '#94a3b8' }}>●</span> {bestRow?.method}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        {scens.map((s) => <span key={s} className="badge info" style={{ fontSize: '10px', padding: '1px 6px' }}>{s}</span>)}
                      </div>
                    </td>
                    <td style={{ fontWeight: 700, color: maxNdcg > 0.7 ? '#10b981' : maxNdcg > 0.5 ? '#f59e0b' : '#ef4444' }}>
                      {maxNdcg.toFixed(4)}
                    </td>
                    <td style={{ fontWeight: 600, color: '#94a3b8' }}>{avgNdcg.toFixed(4)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Method legend */}
      <div className="card" style={{ marginTop: '16px' }}>
        <div className="card-body" style={{ padding: '12px 16px' }}>
          <div style={{ fontSize: '0.6875rem', color: '#64748b', fontWeight: 600, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Method Legend
          </div>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {[...new Set(exp.results.map((r) => r.method))].map((m) => (
              <div key={m} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: METHOD_COLORS[m] || '#64748b' }} />
                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{m}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
