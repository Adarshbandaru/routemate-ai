import {
  Car,
  Compass,
  Activity,
  Zap,
  Layers,
  FlaskConical,
  Sliders,
  Network,
} from 'lucide-react';

export const NAV_ITEMS = [
  { id: 'ride', label: 'Rapido App', num: '00', icon: Car },
  { id: 'demo', label: 'Guided Demo', num: '01', icon: Compass },
  { id: 'playground', label: 'Match Playground', num: '02', icon: Activity },
  { id: 'batch', label: 'Batch Assignment', num: '03', icon: Zap },
  { id: 'staging', label: 'Fleet Staging', num: '04', icon: Layers },
  { id: 'experiments', label: 'Experiments', num: '05', icon: FlaskConical },
  { id: 'api', label: 'Live API', num: '06', icon: Sliders },
  { id: 'architecture', label: 'Architecture', num: '07', icon: Network },
];
