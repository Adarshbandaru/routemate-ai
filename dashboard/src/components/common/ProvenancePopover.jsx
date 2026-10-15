import { useState, useRef, useEffect } from 'react';
import { ShieldCheck, AlertTriangle } from 'lucide-react';
import { getProvenanceForMetric } from '../../provenance/evidenceLedgerData';

export default function ProvenancePopover({
  experimentId,
  overrideData = null,
  children,
  inline = true,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  const prov = overrideData || (experimentId ? getProvenanceForMetric(experimentId) : null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  if (!prov) {
    return <>{children}</>;
  }

  const isVerified = prov.status === 'verified';
  const isDiscrepancy = prov.status === 'discrepancy';

  return (
    <span className={`provenance-wrapper ${inline ? 'inline' : ''}`} ref={containerRef}>
      {children}
      <button
        type="button"
        className={`provenance-badge-btn ${isDiscrepancy ? 'discrepancy' : isVerified ? 'verified' : 'unverified'}`}
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            setIsOpen(!isOpen);
          }
        }}
        aria-label={`View provenance for ${prov.metricName || prov.experimentId}`}
        aria-expanded={isOpen}
        title="Metric Provenance: click to trace to artifact, seed, and evidence class"
      >
        {isDiscrepancy ? (
          <AlertTriangle size={11} aria-hidden="true" />
        ) : (
          <ShieldCheck size={11} aria-hidden="true" />
        )}
        <span className="provenance-tag-text">{isDiscrepancy ? 'Discrepancy' : 'Artifact'}</span>
      </button>

      {isOpen && (
        <div className="provenance-popover-card animate-in" role="dialog" aria-modal="false">
          <div className="provenance-popover-header">
            <div className="provenance-title-row">
              <span className="provenance-exp-id">{prov.experimentId || 'Benchmark'}</span>
              <span className={`badge ${isDiscrepancy ? 'danger' : isVerified ? 'success' : 'neutral'}`}>
                {prov.status ? prov.status.toUpperCase().replace('_', ' ') : 'VERIFIED'}
              </span>
            </div>
            <p className="provenance-claim">{prov.claim}</p>
          </div>

          <div className="provenance-popover-body">
            <div className="provenance-field">
              <span className="field-label">Artifact Path</span>
              <code className="field-code">{prov.artifactPath}</code>
            </div>

            <div className="provenance-field-grid">
              <div className="provenance-field">
                <span className="field-label">Evidence Class</span>
                <span className="field-value">{prov.evidenceClass}</span>
              </div>
              <div className="provenance-field">
                <span className="field-label">Scenario / Seed</span>
                <span className="field-value">{prov.scenario}</span>
              </div>
            </div>

            {prov.baseline && (
              <div className="provenance-field">
                <span className="field-label">Comparative Baseline</span>
                <span className="field-value">{prov.baseline}</span>
              </div>
            )}

            {prov.notes && (
              <div className="provenance-notes">
                <span>{prov.notes}</span>
              </div>
            )}
          </div>

          <div className="provenance-popover-footer">
            <span className="prov-status-indicator">
              <span className={`status-dot ${isDiscrepancy ? 'offline' : 'online'}`} />
              {isDiscrepancy ? 'Reported vs artifact divergence' : 'Verified against checked-in output'}
            </span>
          </div>
        </div>
      )}
    </span>
  );
}
