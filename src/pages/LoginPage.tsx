import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { setTokens } from '../lib/auth';

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await api.login(username, password);
      if (res.success && res.accessToken && res.refreshToken) {
        setTokens(res.accessToken, res.refreshToken);
        navigate('/', { replace: true });
      } else {
        setError(res.message || 'Invalid credentials');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-fleet-500 to-fleet-700 flex items-center justify-center text-white font-bold text-2xl shadow-lg shadow-fleet-500/25 mx-auto mb-4">
            R
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Ricky Fleet</h1>
          <p className="text-surface-400 mt-1">Monitoring Dashboard</p>
        </div>

        {/* Login Card */}
        <div className="glass-card p-8">
          <h2 className="text-lg font-semibold text-white mb-6">Operator Login</h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="login-username" className="block text-sm font-medium text-surface-300 mb-2">
                Username
              </label>
              <input
                id="login-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                required
                autoFocus
                className="w-full bg-surface-800/50 border border-surface-700/50 rounded-xl px-4 py-3 text-sm text-surface-200 placeholder-surface-500
                           focus:outline-none focus:ring-2 focus:ring-fleet-500/30 focus:border-fleet-500/50 transition-all"
              />
            </div>

            <div>
              <label htmlFor="login-password" className="block text-sm font-medium text-surface-300 mb-2">
                Password
              </label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                className="w-full bg-surface-800/50 border border-surface-700/50 rounded-xl px-4 py-3 text-sm text-surface-200 placeholder-surface-500
                           focus:outline-none focus:ring-2 focus:ring-fleet-500/30 focus:border-fleet-500/50 transition-all"
              />
            </div>

            {error && (
              <div className="bg-danger-500/10 border border-danger-500/30 rounded-xl px-4 py-3 text-sm text-danger-400">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !username || !password}
              className="btn btn--primary w-full py-3"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Signing in...
                </span>
              ) : (
                'Sign In'
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-surface-600 mt-6">
          Ricky Fleet Monitoring System · Pilot v1.0
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
