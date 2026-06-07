import React from 'react';

/**
 * Mock remote access panel for Tailscale SSH and RustDesk.
 * Non-functional in MVP — displays styled disabled buttons with "Coming Soon" tooltips.
 */
const RemoteAccessPanel: React.FC<{ deviceId: string }> = ({ deviceId }) => {
  return (
    <div>
      <h3 className="text-sm font-semibold text-surface-300 uppercase tracking-wider mb-4">
        Remote Access
      </h3>
      <div className="glass-card p-5 space-y-4">
        <p className="text-xs text-surface-500">
          Securely connect to <span className="text-fleet-400 font-mono">{deviceId}</span> via remote tools.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Tailscale SSH */}
          <div className="relative group">
            <button
              disabled
              className="btn btn--ghost w-full opacity-60 cursor-not-allowed"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
              </svg>
              Tailscale SSH
            </button>
            <div className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-surface-700 text-xs text-surface-300 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
              Coming Soon
            </div>
          </div>

          {/* RustDesk */}
          <div className="relative group">
            <button
              disabled
              className="btn btn--ghost w-full opacity-60 cursor-not-allowed"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M21 2H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h7l-2 3v1h8v-1l-2-3h7c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H3V4h18v12z" />
              </svg>
              RustDesk
            </button>
            <div className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-surface-700 text-xs text-surface-300 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
              Coming Soon
            </div>
          </div>
        </div>

        <p className="text-xs text-surface-600 italic">
          Remote access will be available in a future update. Requires Tailscale/RustDesk agent
          installed on the Pi gateway.
        </p>
      </div>
    </div>
  );
};

export default RemoteAccessPanel;
