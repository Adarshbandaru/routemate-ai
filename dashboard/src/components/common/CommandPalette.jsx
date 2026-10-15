import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search,
  Compass,
  FlaskConical,
  Activity,
  Layers,
  Zap,
  Sliders,
  Copy,
  Moon,
  Sun,
  ShieldCheck,
  Check,
} from 'lucide-react';
import { EXPERIMENT_DATA, DEMO_RIDE_PRESETS } from '../../data';

export default function CommandPalette({
  isOpen,
  onClose,
  onNavigateRoute,
  onSelectPreset,
  onToggleTheme,
  currentTheme,
  onToggleReducedMotion,
  reducedMotion,
  onOpenEvidenceLedger,
}) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [copiedLink, setCopiedLink] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const items = useMemo(() => {
    const list = [
      // Navigation
      { id: 'nav-ride', category: 'Navigation', title: 'Book a Ride', subtitle: 'Punjab shared mobility corridor & matching experience', icon: Compass, action: () => onNavigateRoute('ride') },
      { id: 'nav-demo', category: 'Navigation', title: 'Guided Walkthrough', subtitle: 'Step-by-step interactive workflow walkthrough', icon: Compass, action: () => onNavigateRoute('demo') },
      { id: 'nav-playground', category: 'Navigation', title: 'Match Playground', subtitle: 'Interactive corridor geometry & feasibility matrix', icon: Activity, action: () => onNavigateRoute('playground') },
      { id: 'nav-batch', category: 'Navigation', title: 'Batch Assignment', subtitle: 'Solver race: Greedy, Auction, and Exact B&B', icon: Zap, action: () => onNavigateRoute('batch') },
      { id: 'nav-staging', category: 'Navigation', title: 'Fleet Staging', subtitle: 'Transit zone predictive fleet rebalancing', icon: Layers, action: () => onNavigateRoute('staging') },
      { id: 'nav-experiments', category: 'Navigation', title: '14 Experiments', subtitle: 'All 14 checked-in empirical benchmarks', icon: FlaskConical, action: () => onNavigateRoute('experiments') },
      { id: 'nav-api', category: 'Navigation', title: 'Live API Console', subtitle: 'Interactive REST API client & offline simulation', icon: Sliders, action: () => onNavigateRoute('api') },
      { id: 'nav-architecture', category: 'Navigation', title: 'System Architecture', subtitle: 'Data flow and pipeline mathematical specification', icon: Layers, action: () => onNavigateRoute('architecture') },

      // Global Actions
      { id: 'act-ledger', category: 'Action', title: 'Open Evidence Ledger', subtitle: 'Inspect auditable claims vs experiment outputs (Key: E)', icon: ShieldCheck, action: () => onOpenEvidenceLedger() },
      {
        id: 'act-copy-link',
        category: 'Action',
        title: 'Copy Shareable Link',
        subtitle: 'Copy current scenario & view deep link to clipboard',
        icon: copiedLink ? Check : Copy,
        action: () => {
          if (typeof window !== 'undefined') {
            navigator.clipboard.writeText(window.location.href);
            setCopiedLink(true);
            setTimeout(() => setCopiedLink(false), 2000);
          }
        },
      },
      {
        id: 'act-motion',
        category: 'Action',
        title: reducedMotion ? 'Disable Reduced Motion' : 'Enable Reduced Motion',
        subtitle: 'Toggle accessible non-animated step-through mode',
        icon: Activity,
        action: () => onToggleReducedMotion(),
      },
      {
        id: 'act-theme',
        category: 'Action',
        title: currentTheme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme',
        subtitle: 'Toggle UI color theme',
        icon: currentTheme === 'dark' ? Sun : Moon,
        action: () => onToggleTheme(),
      },

      // Presets
      ...DEMO_RIDE_PRESETS.map((p) => ({
        id: `preset-${p.id}`,
        category: 'Scenario Presets',
        title: p.title,
        subtitle: p.subtitle,
        icon: Compass,
        action: () => {
          onNavigateRoute('demo');
          onSelectPreset(p.id);
        },
      })),

      // Experiments (001–014)
      ...Object.entries(EXPERIMENT_DATA).map(([expId, exp]) => ({
        id: `exp-${expId}`,
        category: 'Experiments',
        title: `Exp ${expId.split('_')[0]}: ${exp.name}`,
        subtitle: exp.description,
        icon: FlaskConical,
        action: () => {
          onNavigateRoute('experiments');
          if (typeof window !== 'undefined') {
            window.location.hash = `#/experiments?exp=${expId}`;
          }
        },
      })),
    ];

    if (!query.trim()) return list;
    const q = query.toLowerCase();
    return list.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.subtitle.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q)
    );
  }, [
    query,
    onNavigateRoute,
    onSelectPreset,
    onToggleTheme,
    currentTheme,
    onToggleReducedMotion,
    reducedMotion,
    onOpenEvidenceLedger,
    copiedLink,
  ]);

  // Key navigation
  useEffect(() => {
    function handleKeyDown(e) {
      if (!isOpen) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((idx) => (idx + 1) % Math.max(1, items.length));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((idx) => (idx - 1 + items.length) % Math.max(1, items.length));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (items[selectedIndex]) {
          items[selectedIndex].action();
          onClose();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, items, selectedIndex, onClose]);

  if (!isOpen) return null;

  return (
    <div className="palette-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Command Palette">
      <div className="palette-card animate-in" onClick={(e) => e.stopPropagation()}>
        {/* Input */}
        <div className="palette-input-box">
          <Search size={18} className="text-muted" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            className="palette-input"
            placeholder="Type a command, experiment (001-014), preset, or page..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            aria-autocomplete="list"
          />
          <kbd className="palette-kbd">ESC</kbd>
        </div>

        {/* Results */}
        <div className="palette-results-list" role="listbox">
          {items.map((item, idx) => {
            const Icon = item.icon;
            const isSelected = idx === selectedIndex;
            return (
              <div
                key={item.id}
                role="option"
                aria-selected={isSelected}
                className={`palette-item ${isSelected ? 'selected' : ''}`}
                onClick={() => {
                  item.action();
                  onClose();
                }}
                onMouseEnter={() => setSelectedIndex(idx)}
              >
                <div className="palette-item-icon">
                  <Icon size={16} />
                </div>
                <div className="palette-item-content">
                  <div className="palette-item-title-row">
                    <span className="palette-item-title">{item.title}</span>
                    <span className="palette-category-badge">{item.category}</span>
                  </div>
                  <div className="palette-item-subtitle">{item.subtitle}</div>
                </div>
              </div>
            );
          })}

          {items.length === 0 && (
            <div className="empty-state" style={{ padding: '24px' }}>
              <div className="empty-state-text">No commands found for "{query}"</div>
            </div>
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="palette-footer">
          <span><kbd>↑</kbd> <kbd>↓</kbd> to navigate</span>
          <span><kbd>↵</kbd> to select</span>
          <span><kbd>ESC</kbd> to dismiss</span>
        </div>
      </div>
    </div>
  );
}
