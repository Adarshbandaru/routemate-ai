import { Eye, Code } from 'lucide-react';

export default function AudienceToggle({ mode = 'overview', onChange }) {
  return (
    <div className="segmented-control audience-toggle" role="group" aria-label="Audience depth mode">
      <button
        type="button"
        id="audience-overview-btn"
        className={`segmented-btn ${mode === 'overview' ? 'active' : ''}`}
        onClick={() => onChange('overview')}
        aria-pressed={mode === 'overview'}
        title="Recruiter / Executive overview: clear narrative, essential metrics, progressive disclosure"
      >
        <Eye size={14} aria-hidden="true" />
        <span>Overview</span>
      </button>
      <button
        type="button"
        id="audience-engineer-btn"
        className={`segmented-btn ${mode === 'engineer' ? 'active' : ''}`}
        onClick={() => onChange('engineer')}
        aria-pressed={mode === 'engineer'}
        title="Engineer inspection mode: artifact filepaths, seeds, raw JSON, formulas, complexity bounds"
      >
        <Code size={14} aria-hidden="true" />
        <span>Engineer</span>
      </button>
    </div>
  );
}
