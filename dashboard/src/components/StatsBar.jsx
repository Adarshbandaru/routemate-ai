export default function StatsBar({ stats }) {
  if (!stats) return null;

  const cards = [
    { label: 'Total Drivers', value: stats.total, color: 'purple', detail: 'candidates evaluated' },
    { label: 'Eligible', value: stats.eligible_count, color: 'green', detail: `${(stats.match_rate * 100).toFixed(0)}% match rate` },
    { label: 'Rejected', value: stats.rejected_count, color: 'amber', detail: 'failed feasibility' },
    { label: 'Top Score', value: stats.top_score.toFixed(1), color: 'cyan', detail: 'heuristic index /100' },
    { label: 'Avg Score', value: stats.avg_score.toFixed(1), color: 'pink', detail: 'eligible mean' },
  ];

  return (
    <div className="stats-grid animate-in" id="stats-bar">
      {cards.map((card, i) => (
        <div className={`stat-card ${card.color} animate-in animate-in-delay-${i + 1}`} key={card.label}>
          <div className="stat-label">{card.label}</div>
          <div className={`stat-value ${card.color}`}>{card.value}</div>
          <div className="stat-detail">{card.detail}</div>
        </div>
      ))}
    </div>
  );
}
