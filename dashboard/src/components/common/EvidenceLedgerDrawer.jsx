import { useState, useMemo, useEffect } from 'react';
import { X, ShieldCheck, Search, FileText } from 'lucide-react';
import { EVIDENCE_LEDGER } from '../../provenance/evidenceLedgerData';

export default function EvidenceLedgerDrawer({ isOpen, onClose }) {
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Handle escape key
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const filteredItems = useMemo(() => {
    return EVIDENCE_LEDGER.filter((item) => {
      if (filterStatus === 'verified' && item.status !== 'verified') return false;
      if (filterStatus === 'discrepancy' && item.status !== 'discrepancy') return false;

      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        item.claim.toLowerCase().includes(q) ||
        item.experimentId.toLowerCase().includes(q) ||
        item.artifactPath.toLowerCase().includes(q) ||
        item.value.toLowerCase().includes(q)
      );
    });
  }, [filterStatus, searchQuery]);

  if (!isOpen) return null;

  const verifiedCount = EVIDENCE_LEDGER.filter((i) => i.status === 'verified').length;
  const discrepancyCount = EVIDENCE_LEDGER.filter((i) => i.status === 'discrepancy').length;

  return (
    <div className="drawer-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Evidence Ledger">
      <div className="drawer-panel animate-in" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="drawer-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldCheck size={18} className="text-accent" />
              <h2 className="drawer-title">Research Evidence Ledger</h2>
              <span className="badge neutral">Shortcut: E</span>
            </div>
            <p className="drawer-subtitle">
              Auditable inventory of all algorithmic claims, verified against artifact outputs.
            </p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close Evidence Ledger">
            <X size={16} />
          </button>
        </div>

        {/* Audit Stats Banner */}
        <div className="ledger-stats-banner">
          <div className="ledger-stat-item">
            <span className="stat-num">{verifiedCount}</span>
            <span className="stat-label">Verified Artifacts</span>
          </div>
          <div className="ledger-stat-item warning">
            <span className="stat-num">{discrepancyCount}</span>
            <span className="stat-label">Source Discrepancies</span>
          </div>
          <div className="ledger-stat-item">
            <span className="stat-num">14/14</span>
            <span className="stat-label">Experiments Tracked</span>
          </div>
        </div>

        {/* Controls */}
        <div className="ledger-controls">
          <div className="search-input-wrapper" style={{ flex: 1 }}>
            <Search size={14} className="search-icon" />
            <input
              type="text"
              className="form-input search-input"
              placeholder="Search claims, metrics, artifacts, seeds..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Filter evidence ledger"
            />
          </div>
          <div className="segmented-control" role="group" aria-label="Filter by status">
            <button
              type="button"
              className={`segmented-btn ${filterStatus === 'all' ? 'active' : ''}`}
              onClick={() => setFilterStatus('all')}
            >
              All ({EVIDENCE_LEDGER.length})
            </button>
            <button
              type="button"
              className={`segmented-btn ${filterStatus === 'verified' ? 'active' : ''}`}
              onClick={() => setFilterStatus('verified')}
            >
              Verified ({verifiedCount})
            </button>
            <button
              type="button"
              className={`segmented-btn ${filterStatus === 'discrepancy' ? 'active' : ''}`}
              onClick={() => setFilterStatus('discrepancy')}
            >
              Discrepancies ({discrepancyCount})
            </button>
          </div>
        </div>

        {/* List */}
        <div className="drawer-content ledger-list">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              className={`card ledger-card ${item.status === 'discrepancy' ? 'discrepancy-border' : ''}`}
            >
              <div className="ledger-card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="badge font-mono">{item.id}</span>
                  <span className="ledger-exp-title">{item.experimentId}</span>
                </div>
                <span className={`badge ${item.status === 'verified' ? 'success' : 'danger'}`}>
                  {item.status.toUpperCase()}
                </span>
              </div>

              <div className="ledger-claim-text">{item.claim}</div>

              <div className="ledger-metric-box">
                <span className="metric-label">{item.metricName}:</span>
                <span className="metric-value font-mono">{item.value}</span>
              </div>

              <div className="ledger-details-grid">
                <div>
                  <span className="field-label">Evidence Class</span>
                  <span className="field-val">{item.evidenceClass}</span>
                </div>
                <div>
                  <span className="field-label">Scenario & Seed</span>
                  <span className="field-val">{item.scenario}</span>
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                  <span className="field-label">Artifact Path</span>
                  <code className="field-code">{item.artifactPath}</code>
                </div>
                {item.baseline && (
                  <div style={{ gridColumn: 'span 2' }}>
                    <span className="field-label">Baseline Comparison</span>
                    <span className="field-val">{item.baseline}</span>
                  </div>
                )}
              </div>

              {item.notes && (
                <div className={`ledger-notes ${item.status === 'discrepancy' ? 'warning' : ''}`}>
                  {item.notes}
                </div>
              )}
            </div>
          ))}

          {filteredItems.length === 0 && (
            <div className="empty-state">
              <FileText size={32} className="text-muted" />
              <div className="empty-state-text">No matching evidence records found</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
