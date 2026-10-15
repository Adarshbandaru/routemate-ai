import {
  Car,
  Compass,
  Activity,
  Zap,
  Layers,
  FlaskConical,
  Sliders,
  Network,
  Smartphone,
  Calendar,
  History,
  Wallet,
} from 'lucide-react';

export const NAV_ITEMS = [
  { id: 'ride', label: 'Book a Ride', num: '00', icon: Car },
  { id: 'driver', label: 'Driver Console', num: '01', icon: Smartphone },
  { id: 'scheduled', label: 'Schedule Ride', num: '02', icon: Calendar },
  { id: 'history', label: 'Ride History', num: '03', icon: History },
  { id: 'wallet', label: 'Wallet', num: '04', icon: Wallet },
  { id: 'demo', label: 'Guided Walkthrough', num: '05', icon: Compass },
  { id: 'playground', label: 'Match Playground', num: '06', icon: Activity },
  { id: 'batch', label: 'Batch Pooling', num: '07', icon: Zap },
  { id: 'staging', label: 'Fleet Staging', num: '08', icon: Layers },
  { id: 'experiments', label: '14 Experiments', num: '09', icon: FlaskConical },
  { id: 'api', label: 'Live API', num: '10', icon: Sliders },
  { id: 'architecture', label: 'Architecture', num: '11', icon: Network },
];

