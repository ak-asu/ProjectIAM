'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { QRCodeSVG } from 'qrcode.react';
import { api, type AuthStatus } from '../../lib/api';

export default function StudentPortal() {
  const [sessionId, setSessionId] = useState<string>('');
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showLinking, setShowLinking] = useState(false);
  const [linkForm, setLinkForm] = useState({ username: '', password: '' });

  useEffect(() => {
    const savedSessionId = localStorage.getItem('student_session_id');
    if (savedSessionId) {
      api.getAuthStatus(savedSessionId).then((status) => {
        const expiresAt = new Date(status.expires_at);
        if (expiresAt > new Date()) {
          setSessionId(savedSessionId);
          setAuthStatus(status);
          if (status.did_verified && !status.student_linked) {
            setShowLinking(true);
          }
        } else {
          localStorage.removeItem('student_session_id');
        }
      }).catch(() => { localStorage.removeItem('student_session_id'); })
        .finally(() => setLoading(false));
    }
  }, []);

  const startAuthentication = async () => {
    try {
      setLoading(true);
      setError('');
      const result = await api.startAuth();
      setSessionId(result.sessionId);
      setQrCodeUrl(result.qrCodeUrl);
      localStorage.setItem('student_session_id', result.sessionId);
      pollAuthStatus(result.sessionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const pollAuthStatus = async (sid: string) => {
    const interval = setInterval(async () => {
      try {
        const status = await api.getAuthStatus(sid);
        setAuthStatus(status);
        if (status.did_verified && !status.student_linked) {
          setShowLinking(true);
          setQrCodeUrl('');
          clearInterval(interval);
        } else if (status.student_linked) {
          setShowLinking(false);
          setQrCodeUrl('');
          clearInterval(interval);
        }
      } catch (err) {
        console.error('Poll error:', err);
      }
    }, 3000);
    setTimeout(() => clearInterval(interval), 320000);
  };

  const handleLinking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authStatus?.did_verified) return;
    try {
      setLoading(true);
      setError('');
      const result = await api.linkStudent({
        sessionId,
        username: linkForm.username,
        password: linkForm.password,
        did: authStatus.did || '',
      });
      if (result.success) {
        setShowLinking(false);
        const status = await api.getAuthStatus(sessionId);
        setAuthStatus(status);
      } else {
        setError(result.error || 'Binding failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Binding failed');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('student_session_id');
    setSessionId('');
    setQrCodeUrl('');
    setAuthStatus(null);
    setShowLinking(false);
    setError('');
  };

  if (loading && !sessionId) {
    return (
      <div className="min-h-screen bg-linear-to-br from-gray-900 to-gray-800">
        <div className="container mx-auto px-4 py-8">
          <div className="max-w-4xl mx-auto text-center">
            <p className="text-gray-300">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  const showStartButton = !sessionId || (!authStatus?.did_verified && !qrCodeUrl && !showLinking);
  const showQRCode = qrCodeUrl && !authStatus?.did_verified;
  const showLinkingForm = showLinking && !authStatus?.student_linked;
  const showDashboard = authStatus?.student_linked;

  return (
    <div className="min-h-screen bg-linear-to-br from-gray-900 to-gray-800">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8 flex justify-between items-center">
          <Link href="/" className="text-blue-400 hover:underline">
            Home
          </Link>
          {authStatus?.student_linked && (
            <button
              onClick={handleLogout}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm"
            >
              Logout
            </button>
          )}
        </div>
        <div className="max-w-4xl mx-auto">
          <header className="text-center mb-8">
            <h1 className="text-4xl font-bold text-white mb-2">
              Student Portal
            </h1>
            {!showDashboard && <p className="text-gray-300">
              Authenticate with Privado ID to access credentials
            </p>}
          </header>
          {error && (
            <div className="bg-red-900 border border-red-700 text-red-200 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}
          {showStartButton && (
            <div className="bg-gray-800 rounded-lg shadow-lg p-8">
              <h2 className="text-2xl font-bold text-white mb-4">
                Get Started
              </h2>
              <p className="text-gray-300 mb-6">
                Start authentication with your Privado ID wallet
              </p>
              <button
                onClick={startAuthentication}
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg disabled:opacity-50"
              >
                {loading ? 'Loading...' : 'Authenticate with DID'}
              </button>
            </div>
          )}
          {showQRCode && (
            <div className="bg-gray-800 rounded-lg shadow-lg p-8">
              <h2 className="text-2xl font-bold text-white mb-4">
                Scan QR Code
              </h2>
              <p className="text-gray-300 mb-6">
                Scan with your Privado ID app to authenticate
              </p>
              <div className="bg-white p-8 rounded-lg flex justify-center">
                <QRCodeSVG value={qrCodeUrl} size={256} level="M" />
              </div>
              <p className="mt-4 text-sm text-gray-400 text-center">Waiting...</p>
            </div>
          )}
          {showLinkingForm && (
            <div className="bg-gray-800 rounded-lg shadow-lg p-8">
              <h2 className="text-2xl font-bold text-white mb-4">
                Link Your Account
              </h2>
              <p className="text-gray-300 mb-6">
                Enter your university credentials.
              </p>
              <form onSubmit={handleLinking} className="space-y-4">
                <div>
                  <label className="block text-gray-300 mb-2">
                    Student ID or Email
                  </label>
                  <input
                    type="text"
                    value={linkForm.username}
                    onChange={(e) =>
                      setLinkForm({ ...linkForm, username: e.target.value })
                    }
                    className="w-full px-4 py-2 border border-gray-600 rounded-lg bg-gray-700 text-white"
                    required
                  />
                </div>
                <div>
                  <label className="block text-gray-300 mb-2">
                    Password
                  </label>
                  <input
                    type="password"
                    value={linkForm.password}
                    onChange={(e) =>
                      setLinkForm({ ...linkForm, password: e.target.value })
                    }
                    className="w-full px-4 py-2 border border-gray-600 rounded-lg bg-gray-700 text-white"
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg disabled:opacity-50"
                >
                  {loading ? 'Linking...' : 'Link Account'}
                </button>
              </form>
            </div>
          )}
          {showDashboard && (
            <div className="space-y-6">
              <div className="bg-gray-800 rounded-lg shadow-lg p-8">
                <h3 className="text-xl font-semibold text-white mb-4">
                  Your Credentials
                </h3>
                <div className="bg-gray-700 rounded-lg p-4">
                  <p className="text-sm text-gray-400">
                    No credentials yet.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
