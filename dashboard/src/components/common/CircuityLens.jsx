import { Sliders, AlertOctagon, CheckCircle2, Info } from 'lucide-react';
import ProvenancePopover from './ProvenancePopover';

export default function CircuityLens({
  isEnabled,
  onToggle,
  euclideanDetourKm = 0.56,
  roadDetourKm = 1.06,
  circuityFactor = 1.341,
  gateThresholdKm = 2.0,
}) {
  const euclideanAccepted = euclideanDetourKm <= gateThresholdKm;
  const roadAccepted = roadDetourKm <= gateThresholdKm;
  const isDivergent = euclideanAccepted !== roadAccepted;

  return (
    <div className={`circuity-lens-card card ${isEnabled ? 'lens-active' : ''}`} role="region" aria-label="Circuity Lens Controls">
      <div className="card-header" style={{ padding: '10px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sliders size={15} className={isEnabled ? 'text-cyan' : 'text-muted'} />
            <div>
              <span className="card-title" style={{ fontSize: '0.85rem' }}>Circuity Lens</span>
              <span className="badge neutral" style={{ marginLeft: '6px' }}>Road vs Euclidean</span>
            </div>
          </div>
          <button
            type="button"
            className={`btn btn-sm ${isEnabled ? 'btn-primary' : 'btn-outline'}`}
            onClick={onToggle}
            aria-pressed={isEnabled}
          >
            {isEnabled ? 'Lens Active' : 'Enable Lens'}
          </button>
        </div>
      </div>

      {isEnabled && (
        <div className="card-body" style={{ padding: '12px 14px' }}>
          <p className="circuity-explainer">
            Compares the straight-line Euclidean assumption against directed street-network topology.
          </p>

          <div className="circuity-metrics-grid font-mono">
            <div className="circuity-metric-tile">
              <span className="metric-label">Euclidean Detour</span>
              <span className="metric-val">{euclideanDetourKm.toFixed(2)} km</span>
              <span className={`gate-status ${euclideanAccepted ? 'pass' : 'fail'}`}>
                {euclideanAccepted ? '✓ Below 2.0 km gate' : '✕ Exceeds gate'}
              </span>
            </div>

            <div className="circuity-metric-tile">
              <span className="metric-label">Road Network Detour</span>
              <span className="metric-val">{roadDetourKm.toFixed(2)} km</span>
              <span className={`gate-status ${roadAccepted ? 'pass' : 'fail'}`}>
                {roadAccepted ? '✓ Admissible on graph' : '✕ Exceeds street gate'}
              </span>
            </div>

            <div className="circuity-metric-tile">
              <span className="metric-label">Circuity Multiplier</span>
              <span className="metric-val text-amber">{circuityFactor.toFixed(3)}×</span>
              <span className="gate-status text-muted">Street / Straight-line</span>
            </div>
          </div>

          {/* Divergence Verdict Callout */}
          <div className={`circuity-verdict-box ${isDivergent ? 'divergent' : 'congruent'}`}>
            {isDivergent ? (
              <>
                <AlertOctagon size={16} className="text-danger" style={{ flexShrink: 0 }} />
                <div>
                  <strong>False Positive Gate Divergence:</strong> Euclidean gating accepts ({euclideanDetourKm.toFixed(2)} km ≤ {gateThresholdKm} km), but directed street routing rejects ({roadDetourKm.toFixed(2)} km &gt; {gateThresholdKm} km due to one-way street detours).
                </div>
              </>
            ) : (
              <>
                <CheckCircle2 size={16} className="text-success" style={{ flexShrink: 0 }} />
                <div>
                  <strong>Gates Agree:</strong> Both Euclidean and street-network checks reach the same feasibility determination for this candidate.
                </div>
              </>
            )}
          </div>

          {/* Benchmark Provenance Tag */}
          <div className="circuity-benchmark-note">
            <Info size={12} className="text-muted" />
            <span>
              Tested scenario (OSM SF Downtown, Exp 008): <strong>75.6% false-positive rate</strong> and <strong>68.0% top-1 disagreement</strong>.
            </span>
            <ProvenancePopover experimentId="008_road_network_validation" />
          </div>
        </div>
      )}
    </div>
  );
}
