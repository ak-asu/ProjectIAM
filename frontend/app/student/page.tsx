'use client';

import { useState } from 'react';
import Link from 'next/link';
import { QRCodeSVG } from 'qrcode.react';
import { api, type AuthStatus } from '../../lib/api';

export default function StudentPortal() {
  const [sessionId, setSessionId] = useState<string>('');
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showLinking, setShowLinking] = useState(false);
  const [linkForm, setLinkForm] = useState({ username: '', password: '' });

  const startAuthentication = async () => {
    try {
      setLoading(true);
      setError('');
      const result = await api.startAuth();
      setSessionId(result.sessionId);
      setQrCodeUrl(result.qrCodeUrl);
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
        if (status.didVerified && !status.studentLinked) {
          setShowLinking(true);
          clearInterval(interval);
        } else if (status.studentLinked) {
          clearInterval(interval);
        }
      } catch (err) {
        console.error('Poll error:', err);
      }
    }, 4000);
    setTimeout(() => clearInterval(interval), 320000);
  };

  const handleLinking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authStatus?.didVerified) return;
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

  return (
    <div className="min-h-screen bg-linear-to-br from-gray-900 to-gray-800">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <Link href="/" className="text-blue-400 hover:underline">
            Home
          </Link>
        </div>
        <div className="max-w-4xl mx-auto">
          <header className="text-center mb-8">
            <h1 className="text-4xl font-bold text-white mb-2">
              Student Portal
            </h1>
            <p className="text-gray-300">
              Authenticate with Privado ID to access credentials
            </p>
          </header>
          {error && (
            <div className="bg-red-900 border border-red-700 text-red-200 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}
          {!sessionId && (
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
          {qrCodeUrl && !authStatus?.didVerified && (
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
              <p className="mt-4 text-sm text-gray-400">Waiting...</p>
            </div>
          )}
          {showLinking && (
            <div className="bg-gray-800 rounded-lg shadow-lg p-8">
              <h2 className="text-2xl font-bold text-white mb-4">
                Link Your Account
              </h2>
              <p className="text-gray-300 mb-6">
                Enter university credentials to connect your DID
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
          {authStatus?.studentLinked && (
            <div className="bg-gray-800 rounded-lg shadow-lg p-8">
              <h2 className="text-2xl font-bold text-green-600 mb-4">
                Authentication Successful
              </h2>
              <div className="space-y-4">
                <div className="border-t border-gray-700 pt-4">
                  <h3 className="text-lg font-semibold text-white mb-4">
                    Your Credentials
                  </h3>
                  <div className="bg-gray-700 rounded-lg p-4">
                    <p className="text-sm text-gray-400">
                      No credentials yet. Contact your university to get started.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
