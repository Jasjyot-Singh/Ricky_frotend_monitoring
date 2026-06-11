import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useFleetStore } from '../../store/useFleetStore';
import { clearTokens } from '../../lib/auth';
import { fleetSocket } from '../../lib/socket';

const Header: React.FC = () => {
  const navigate = useNavigate();
  const isConnected = useFleetStore((s) => s.isConnected);

  const handleLogout = () => {
    clearTokens();
    fleetSocket.disconnect();
    navigate('/login', { replace: true });
  };

  return (
    <header className="h-16 bg-surface-900/50 backdrop-blur-md border-b border-surface-700/30 flex items-center justify-between px-6 sticky top-0 z-30">
      {/* Left: Empty placeholder to maintain flex layout */}
      <div className="flex items-center gap-3">
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
            {isConnected ? 'Backend Connected' : 'Backend Disconnected'}
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
