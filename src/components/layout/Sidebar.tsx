import React from 'react';
import { NavLink } from 'react-router-dom';
import { useFleetStats } from '../../store/useFleetStore';
import rickyLogo from '../../assets/official_ricky_logo.png';

const navItems = [
  {
    to: '/',
    label: 'Fleet Overview',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
      </svg>
    ),
  },
  {
    to: '/alerts',
    label: 'Diagnostics Alerts',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
      </svg>
    ),
  },
  {
    to: '/calculator',
    label: 'Impression Calculator',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 15.75V18m-3-3v3h.008v-.008H12.75zm-6 0h.008v-.008H6.75zm-.008-3h.008v-.008H6.742zm0-3h.008v-.008H6.742zm3 6h.008v-.008H9.75zm0-3h.008v-.008H9.75zm0-3h.008v-.008H9.75zm3 0h.008v-.008h-.008zm0 3h.008v-.008h-.008zm3-10.5a.75.75 0 01.75.75v6.75a.75.75 0 01-.75.75H3.75a.75.75 0 01-.75-.75V3.75a.75.75 0 01.75-.75h12zm0 9H3.75v-9H15.75v9z" />
      </svg>
    ),
  },
];

const Sidebar: React.FC = () => {
  const stats = useFleetStats();

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-surface-900/80 backdrop-blur-xl border-r border-surface-700/50 flex flex-col z-40">
      {/* Logo */}
      <div className="p-5 border-b border-surface-700/50">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-surface-950 border border-surface-700/80 p-1.5 flex items-center justify-center shadow-lg shadow-black/40 overflow-hidden shrink-0">
            <img
              src={rickyLogo}
              alt="Ricky Logo"
              className="w-full h-full object-contain filter drop-shadow"
            />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-white tracking-tight flex items-center gap-0.5">
              Ricky<span className="text-xs font-semibold align-top text-surface-400">TM</span>
            </h1>
            <p className="text-xs font-semibold text-fleet-400 mt-0.5">Monitoring System</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                isActive
                  ? 'bg-fleet-600/20 text-fleet-400 border border-fleet-500/30 shadow-lg shadow-fleet-500/10'
                  : 'text-surface-400 hover:text-surface-200 hover:bg-surface-800/50'
              }`
            }
          >
            {item.icon}
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* Fleet Stats Summary */}
      <div className="p-4 border-t border-surface-700/50">
        <div className="glass-card p-4 space-y-3">
          <p className="text-xs font-semibold text-surface-400 uppercase tracking-wider">Fleet Status</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="text-center">
              <p className="text-2xl font-bold text-fleet-400">{stats.healthy}</p>
              <p className="text-xs text-surface-500">Healthy</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-surface-500">{stats.offline}</p>
              <p className="text-xs text-surface-500">Offline</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-danger-400">{stats.sosActive}</p>
              <p className="text-xs text-surface-500">SOS</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-warning-400">{stats.warning}</p>
              <p className="text-xs text-surface-500">Warning</p>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
