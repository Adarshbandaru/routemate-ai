export default function StatsBar({ stats }) {
  if (!stats) return null;

  const cards = [
    { label: 'Candidate Fleet', value: stats.total, color: 'blue', detail: 'drivers in corridor scope' },
    { label: 'Feasible Pool', value: stats.eligible_count, color: 'green', detail: `${(stats.match_rate * 100).toFixed(0)}% pass rate` },
    { label: 'Pruned / Infeasible', value: stats.rejected_count, color: 'rose', detail: 'hard constraint filter' },
    { label: 'Top Match Score', value: stats.top_score.toFixed(1), color: 'indigo', detail: 'normalized rank /100' },
    { label: 'Cohort Average', value: stats.avg_score.toFixed(1), color: 'cyan', detail: 'eligible mean score' },
  ];

  return (
    <div className="stats-grid animate-in" id="stats-bar">
      {cards.map((card) => (
        <div className={`stat-card ${card.color}`} key={card.label}>
          <div className="stat-label">{card.label}</div>
          <div className={`stat-value ${card.color}`}>{card.value}</div>
          <div className="stat-detail">{card.detail}</div>
        </div>
      ))}
    </div>
  );
}
