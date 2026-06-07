import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useFleetStore, useFleetStats } from '../../store/useFleetStore';
import { clearTokens } from '../../lib/auth';
import { fleetSocket } from '../../lib/socket';

const Header: React.FC = () => {
  const navigate = useNavigate();
  const isConnected = useFleetStore((s) => s.isConnected);
  const stats = useFleetStats();

  const handleLogout = () => {
    clearTokens();
    fleetSocket.disconnect();
    navigate('/login', { replace: true });
  };

  return (
    <header className="h-16 bg-surface-900/50 backdrop-blur-md border-b border-surface-700/30 flex items-center justify-between px-6 sticky top-0 z-30">
      {/* Left: Fleet stats pills */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-800/50 border border-surface-700/40">
          <span className="text-xs text-surface-400">Total:</span>
          <span className="text-sm font-semibold text-white">{stats.total}</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-fleet-500/10 border border-fleet-500/20">
          <span className="status-dot status-dot--online" />
          <span className="text-sm font-semibold text-fleet-400">{stats.online}</span>
        </div>
        {stats.sosActive > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-danger-500/10 border border-danger-500/20 sos-pulse">
            <span className="status-dot status-dot--danger" />
            <span className="text-sm font-semibold text-danger-400">{stats.sosActive} SOS</span>
          </div>
        )}
        {stats.lowBattery > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-warning-500/10 border border-warning-500/20">
            <span className="text-xs">🔋</span>
            <span className="text-sm font-semibold text-warning-400">{stats.lowBattery} Low</span>
          </div>
        )}
      </div>

      {/* Right: Connection status + time + logout */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              isConnected ? 'bg-fleet-400 shadow-lg shadow-fleet-400/50' : 'bg-danger-400 animate-pulse'
            }`}
          />
          <span className="text-xs text-surface-400">
            {isConnected ? 'Live' : 'Reconnecting...'}
          </span>
        </div>
        <div className="text-xs text-surface-500 font-mono">
          {new Date().toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          })}
        </div>
        <button
          onClick={handleLogout}
          className="text-xs text-surface-400 hover:text-surface-200 transition-colors px-2 py-1.5 rounded-lg hover:bg-surface-800/50"
        >
          Logout
        </button>
      </div>
    </header>
  );
};

export default Header;
