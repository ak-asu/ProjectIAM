'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '../../lib/api';
import { VerificationResult, VerificationSession } from '../../lib/constants';

export default function EmployerPortal() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userInfo, setUserInfo] = useState<{ email: string; name: string; role: string } | null>(null);
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [activeTab, setActiveTab] = useState<'verify' | 'history'>('verify');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [verifyForm, setVerifyForm] = useState({
    studentId: '',
    degree: '',
    major: '',
    minGraduationYear: '',
    minGpa: '',
  });
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [verifyResult, setVerifyResult] = useState<VerificationResult | null>(null);
  const [verificationHistory, setVerificationHistory] = useState<VerificationSession[]>([]);

  const loadHistory = async () => {
    try {
      const result = await api.getVerificationSessions('employer-portal', 50, 0) as { sessions: VerificationSession[]; total: number };
      setVerificationHistory(result.sessions || []);
    } catch (err) {
      console.error('Failed to load history:', err);
    }
  };

  useEffect(() => {
    try {
      api.verifyPortalToken().then((result) => {
        if (result.success && result.user && result.user.role === 'employer') {
          setIsAuthenticated(true);
          setUserInfo(result.user);
          loadHistory();
        }
      }).catch(() => {
        setIsAuthenticated(false);
      });
    } catch {
      setIsAuthenticated(false);
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const result = await api.portalLogin(loginForm.email, loginForm.password);
      if (result.success && result.user) {
        if (result.user.role !== 'employer') {
          setError('Access denied. Employer account required.');
          await api.portalLogout();
          return;
        }
        setIsAuthenticated(true);
        setUserInfo(result.user);
      } else {
        setError(result.error || 'Login failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await api.portalLogout();
      setIsAuthenticated(false);
      setUserInfo(null);
      setLoginForm({ email: '', password: '' });
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const handleCreateVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setVerifyResult(null);
    try {
      const policy = {
        allowedIssuers: [],
        credentialType: 'DegreeCredential',
        constraints: [
          ...(verifyForm.studentId
            ? [{
              field: 'credentialSubject.studentId',
              operator: '$eq' as const,
              value: verifyForm.studentId,
            }]
            : []),
          ...(verifyForm.degree
            ? [{
              field: 'credentialSubject.degree',
              operator: '$eq' as const,
              value: verifyForm.degree,
            }]
            : []),
          ...(verifyForm.major
            ? [{
              field: 'credentialSubject.major',
              operator: '$eq' as const,
              value: verifyForm.major,
            }]
            : []),
          ...(verifyForm.minGraduationYear
            ? [{
              field: 'credentialSubject.graduationYear',
              operator: '$gte' as const,
              value: parseInt(verifyForm.minGraduationYear),
            }]
            : []),
          ...(verifyForm.minGpa
            ? [{
              field: 'credentialSubject.gpa',
              operator: '$gte' as const,
              value: parseFloat(verifyForm.minGpa),
            }]
            : []),
        ],
      };
      const res = await api.createVerificationSession(policy, 'employer-portal') as {
        verifyId: string;
        qrCodeUrl: string;
      };
      setQrCodeUrl(res.qrCodeUrl);
      pollVerificationStatus(res.verifyId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const pollVerificationStatus = async (vid: string) => {
    const interval = setInterval(async () => {
      try {
        const status = await api.getVerificationStatus(vid) as {
          status: string;
          result?: VerificationResult;
        };
        if (status.status === 'verified' || status.status === 'rejected') {
          setVerifyResult(status.result || null);
          clearInterval(interval);
        }
      } catch (err) {
        console.error('Poll error:', err);
      }
    }, 4000);
    setTimeout(() => clearInterval(interval), 320000);
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-linear-to-br from-gray-900 to-gray-800">
        <div className="container mx-auto px-4 py-8">
          <div className="mb-8">
            <Link href="/" className="text-green-400 hover:underline">
              Home
            </Link>
          </div>
          <div className="max-w-md mx-auto">
            <header className="text-center mb-8">
              <h1 className="text-4xl font-bold text-white mb-2">
                Employer Login
              </h1>
              <p className="text-gray-300">
                Sign in to verify candidate credentials
              </p>
            </header>
            <div className="bg-gray-800 rounded-lg shadow-lg p-8">
              {error && (
                <div className="bg-red-900 border border-red-700 text-red-200 px-4 py-3 rounded mb-4">
                  {error}
                </div>
              )}
              <form onSubmit={handleLogin} className="space-y-6">
                <div>
                  <label className="block text-gray-300 mb-2 font-semibold">
                    Email
                  </label>
                  <input
                    type="email"
                    value={loginForm.email}
                    onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-600 rounded-lg bg-gray-700 text-white"
                    required
                    placeholder="abc@gmail.com"
                  />
                </div>
                <div>
                  <label className="block text-gray-300 mb-2 font-semibold">
                    Password
                  </label>
                  <input
                    type="password"
                    value={loginForm.password}
                    onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-600 rounded-lg bg-gray-700 text-white"
                    required
                    placeholder="••••••••"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg disabled:opacity-50"
                >
                  {loading ? 'Logging in...' : 'Login'}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-gray-900 to-gray-800">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8 flex justify-between items-center">
          <Link href="/" className="text-green-400 hover:underline">
            Home
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-gray-300">
              {userInfo?.name} ({userInfo?.email})
            </span>
            <button
              onClick={handleLogout}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm"
            >
              Logout
            </button>
          </div>
        </div>
        <div className="max-w-6xl mx-auto">
          <header className="text-center mb-8">
            <h1 className="text-4xl font-bold text-white mb-2">
              Employer Portal
            </h1>
            <p className="text-gray-300">
              Verify candidate credentials instantly
            </p>
          </header>
          <div className="bg-gray-800 rounded-lg shadow-lg overflow-hidden">
            <div className="border-b border-gray-700">
              <div className="flex">
                <button
                  onClick={() => setActiveTab('verify')}
                  className={`flex-1 px-6 py-4 font-semibold ${activeTab === 'verify'
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-700 text-gray-300'
                    }`}
                >
                  Verify Credential
                </button>
                <button
                  onClick={() => setActiveTab('history')}
                  className={`flex-1 px-6 py-4 font-semibold ${activeTab === 'history'
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-700 text-gray-300'
                    }`}
                >
                  Verification History
                </button>
              </div>
            </div>
            <div className="p-8">
              {error && (
                <div className="bg-red-900 border border-red-700 text-red-200 px-4 py-3 rounded mb-4">
                  {error}
                </div>
              )}
              {activeTab === 'verify' && (
                <div>
                  <h2 className="text-2xl font-bold text-white mb-6">
                    Create Verification Request
                  </h2>
                  {!qrCodeUrl && (
                    <form onSubmit={handleCreateVerification} className="space-y-6">
                      <div className="grid md:grid-cols-2 gap-6">
                        <div>
                          <label className="block text-gray-300 mb-2 font-semibold">
                            Student ID
                          </label>
                          <input
                            type="text"
                            value={verifyForm.studentId}
                            onChange={(e) =>
                              setVerifyForm({ ...verifyForm, studentId: e.target.value })
                            }
                            className="w-full px-4 py-2 border border-gray-600 rounded-lg bg-gray-700 text-white"
                            placeholder="e.g., STU001"
                          />
                        </div>
                        <div>
                          <label className="block text-gray-300 mb-2 font-semibold">
                            Degree
                          </label>
                          <select
                            value={verifyForm.degree}
                            onChange={(e) =>
                              setVerifyForm({ ...verifyForm, degree: e.target.value })
                            }
                            className="w-full px-4 py-2 border border-gray-600 rounded-lg bg-gray-700 text-white"
                          >
                            <option value="">Any Degree</option>
                            <option>Bachelor of Science</option>
                            <option>Bachelor of Arts</option>
                            <option>Master of Science</option>
                            <option>Master of Arts</option>
                            <option>Doctor of Philosophy</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-gray-300 mb-2 font-semibold">
                            Major
                          </label>
                          <input
                            type="text"
                            value={verifyForm.major}
                            onChange={(e) =>
                              setVerifyForm({ ...verifyForm, major: e.target.value })
                            }
                            className="w-full px-4 py-2 border border-gray-600 rounded-lg bg-gray-700 text-white"
                            placeholder="Any major"
                          />
                        </div>
                        <div>
                          <label className="block text-gray-300 mb-2 font-semibold">
                            Min Graduation Year
                          </label>
                          <input
                            type="number"
                            value={verifyForm.minGraduationYear}
                            onChange={(e) =>
                              setVerifyForm({
                                ...verifyForm,
                                minGraduationYear: e.target.value,
                              })
                            }
                            className="w-full px-4 py-2 border border-gray-600 rounded-lg bg-gray-700 text-white"
                            placeholder="2020"
                            min="1900"
                            max={new Date().getFullYear() + 10}
                          />
                        </div>
                        <div>
                          <label className="block text-gray-300 mb-2 font-semibold">
                            Minimum GPA
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            value={verifyForm.minGpa}
                            onChange={(e) =>
                              setVerifyForm({
                                ...verifyForm,
                                minGpa: e.target.value,
                              })
                            }
                            className="w-full px-4 py-2 border border-gray-600 rounded-lg bg-gray-700 text-white"
                            placeholder="3.0"
                            min="0.0"
                            max="4.0"
                          />
                        </div>
                      </div>
                      <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg disabled:opacity-50"
                      >
                        {loading ? 'Loading...' : 'Generate QR Code'}
                      </button>
                    </form>
                  )}
                  {qrCodeUrl && !verifyResult && (
                    <div className="text-center">
                      <h3 className="text-xl font-bold text-white mb-4">
                        Have Candidate Scan QR
                      </h3>
                      <p className="text-gray-300 mb-6">
                        Candidate scans with Privado ID wallet
                      </p>
                      <div className="bg-white p-8 rounded-lg inline-block">
                        <QRCodeSVG value={qrCodeUrl} size={256} level="M" />
                      </div>
                      <p className="text-xs text-gray-400 mt-4 break-all max-w-md mx-auto">
                        {qrCodeUrl}
                      </p>
                      <p className="mt-4 text-sm text-gray-400">Waiting for proof...</p>
                    </div>
                  )}
                  {verifyResult && (
                    <div className={`rounded-lg p-6 ${verifyResult.verified
                      ? 'bg-green-900 border border-green-700'
                      : 'bg-red-900 border border-red-700'
                      }`}>
                      <h3 className={`text-2xl font-bold mb-4 ${verifyResult.verified
                        ? 'text-green-200'
                        : 'text-red-200'
                        }`}>
                        {verifyResult.verified ? 'Verification Successful' : 'Verification Failed'}
                      </h3>
                      {verifyResult.verified && (
                        <div className="space-y-3 text-gray-300">
                          <div>
                            <span className="font-semibold">Holder DID:</span>{' '}
                            <code className="text-xs bg-white px-2 py-1 rounded">
                              {verifyResult.holder_did?.substring(0, 30)}...
                            </code>
                          </div>
                          {verifyResult.disclosed_attributes && (
                            <div>
                              <span className="font-semibold">Verified Information:</span>
                              <ul className="mt-2 space-y-1 ml-4">
                                {Object.entries(verifyResult.disclosed_attributes).map(([key, value]) => (
                                  <li key={key}>
                                    <span className="font-medium">{key}:</span> {String(value)}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                      {!verifyResult.verified && (
                        <p className="text-red-300">
                          {verifyResult.failure_reason || 'Verification failed'}
                        </p>
                      )}
                      <button
                        onClick={() => {
                          setQrCodeUrl('');
                          setVerifyResult(null);
                        }}
                        className="mt-6 bg-gray-700 text-gray-300 px-6 py-2 rounded-lg border border-gray-600 hover:bg-gray-600"
                      >
                        Create New Verification
                      </button>
                    </div>
                  )}
                </div>
              )}
              {activeTab === 'history' && (
                <div>
                  <h2 className="text-2xl font-bold text-white mb-6">
                    Verification History
                  </h2>
                  {verificationHistory.length === 0 ? (
                    <div className="bg-gray-700 rounded-lg p-6">
                      <p className="text-gray-300">
                        No history yet.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead className="bg-gray-700">
                          <tr>
                            <th className="px-4 py-3 text-gray-300 font-semibold">Date</th>
                            <th className="px-4 py-3 text-gray-300 font-semibold">Status</th>
                            <th className="px-4 py-3 text-gray-300 font-semibold">Student ID</th>
                            <th className="px-4 py-3 text-gray-300 font-semibold">Result</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700">
                          {verificationHistory.map((session) => {
                            const attrs = session.result?.disclosed_attributes as Record<string, any> | undefined;
                            const studentId = (attrs?.studentId || attrs?.student_id) as string | undefined;
                            return (
                              <tr key={session.id} className="hover:bg-gray-750">
                                <td className="px-4 py-3 text-gray-400 text-sm">
                                  {new Date(session.created_at).toLocaleString()}
                                </td>
                                <td className="px-4 py-3">
                                  <span className={`px-2 py-1 text-xs rounded ${session.status === 'verified'
                                      ? 'bg-green-900 text-green-200'
                                      : session.status === 'rejected'
                                        ? 'bg-red-900 text-red-200'
                                        : 'bg-yellow-900 text-yellow-200'
                                    }`}>
                                    {session.status}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-gray-300 text-sm">
                                  {studentId || '-'}
                                </td>
                                <td className="px-4 py-3">
                                  {session.result?.verified !== undefined ? (
                                    session.result.verified ? (
                                      <span className="text-green-400 text-sm">Valid</span>
                                    ) : (
                                      <span className="text-red-400 text-sm">Invalid</span>
                                    )
                                  ) : (
                                    <span className="text-gray-500 text-sm">Pending</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
