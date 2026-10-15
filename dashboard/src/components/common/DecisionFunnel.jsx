import { Filter, CheckCircle2, ShieldAlert, Users, Award, ChevronRight } from 'lucide-react';

export default function DecisionFunnel({
  counts = {
    retrieved: 12,
    pruned: 2,
    gated: 6,
    ranked: 4,
    assigned: 1,
  },
  activeStage = null,
  onSelectStage,
}) {
  const stages = [
    {
      id: 'retrieved',
      label: '1. Retrieved',
      count: counts.retrieved,
      desc: 'Raw Spatial Ingestion',
      icon: Users,
      badge: 'Broad Recall',
    },
    {
      id: 'pruned',
      label: '2. Spatially Pruned',
      count: counts.retrieved - counts.pruned,
      removed: counts.pruned,
      desc: 'Admissible Lower-Bound Cut',
      icon: Filter,
      badge: 'Exp 009 Filter',
    },
    {
      id: 'gated',
      label: '3. Feasibility Gated',
      count: counts.ranked,
      removed: (counts.retrieved - counts.pruned) - counts.ranked,
      desc: '8 Zero-Tolerance Constraints',
      icon: ShieldAlert,
      badge: 'Hard Gates',
    },
    {
      id: 'ranked',
      label: '4. Scored & Ranked',
      count: counts.ranked,
      desc: 'Explainable Multi-Factor Score',
      icon: Award,
      badge: 'Heuristic Ranking',
    },
    {
      id: 'assigned',
      label: '5. Match Assigned',
      count: counts.assigned,
      desc: 'Optimal Dispatch / Pairing',
      icon: CheckCircle2,
      badge: 'Combinatorial Solve',
    },
  ];

  return (
    <div className="decision-funnel-card card" role="region" aria-label="Pipeline Decision Funnel">
      <div className="card-header" style={{ paddingBottom: '8px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Filter size={15} className="text-accent" />
            <h3 className="card-title">Pipeline Decision Funnel</h3>
            <span className="badge neutral">Exact Scenario Counts</span>
          </div>
          <p className="card-subtitle">
            Click any stage to filter the map view to candidates admitted or rejected at that point.
          </p>
        </div>
        {activeStage && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => onSelectStage(null)}
          >
            Clear Filter
          </button>
        )}
      </div>

      <div className="card-body" style={{ paddingTop: '8px' }}>
        <div className="funnel-stages-row">
          {stages.map((stage, idx) => {
            const Icon = stage.icon;
            const isSelected = activeStage === stage.id;
            return (
              <div key={stage.id} className="funnel-node-container">
                <button
                  type="button"
                  className={`funnel-stage-node ${isSelected ? 'selected' : ''}`}
                  onClick={() => onSelectStage(isSelected ? null : stage.id)}
                  aria-pressed={isSelected}
                  aria-label={`${stage.label}: ${stage.count} candidates`}
                >
                  <div className="stage-top-meta">
                    <span className="stage-step-num" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {Icon && <Icon size={12} />}
                      0{idx + 1}
                    </span>
                    <span className="stage-badge-pill">{stage.badge}</span>
                  </div>

                  <div className="stage-main-count font-mono">
                    {stage.count}
                    <span className="stage-unit">pairs</span>
                  </div>

                  <div className="stage-label-title">{stage.label.split('. ')[1]}</div>
                  <div className="stage-desc-text">{stage.desc}</div>

                  {stage.removed > 0 && (
                    <div className="stage-removed-tag">
                      −{stage.removed} rejected
                    </div>
                  )}
                </button>

                {idx < stages.length - 1 && (
                  <div className="funnel-connector" aria-hidden="true">
                    <ChevronRight size={16} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
