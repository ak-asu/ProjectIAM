'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '../../lib/api';
import { CredentialRecord } from '../../lib/constants';

export default function AdminPortal() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [apiKeyForm, setApiKeyForm] = useState('');
  const [activeTab, setActiveTab] = useState<'issue' | 'manage'>('issue');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [offerQR, setOfferQR] = useState('');
  const [credForm, setCredForm] = useState({
    studentId: '',
    university: 'Arizona State University',
    degree: 'Master of Science',
    major: 'Computer Science',
    graduationYear: new Date().getFullYear(),
    gpa: '',
    honors: '',
  });
  const [credentials, setCredentials] = useState<CredentialRecord[]>([]);
  const [revokeModal, setRevokeModal] = useState<{ credId: string; reason: string } | null>(null);

  const loadCredentials = async () => {
    try {
      const result = await api.getAllCredentials(100, 0) as { credentials: CredentialRecord[]; total: number };
      setCredentials(result.credentials || []);
    } catch (err) {
      console.error('Failed to load credentials:', err);
    }
  };

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const result = await api.verifyAdminKey();
        setIsAuthenticated(result.success);
        if (result.success) {
          loadCredentials();
        }
      } catch {
        setIsAuthenticated(false);
      }
    };
    checkAuth();
  }, []);

  const handleRevokeCred = async () => {
    if (!revokeModal) return;
    setLoading(true);
    setError('');
    try {
      const result = await api.revokeCredential(revokeModal.credId, revokeModal.reason) as { success: boolean; error?: string };
      if (result.success) {
        setSuccess('Credential revoked successfully');
        setRevokeModal(null);
        loadCredentials();
      } else {
        setError(result.error || 'Revocation failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Revocation failed');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      api.setAdminKey(apiKeyForm);
      const result = await api.verifyAdminKey();
      if (result.success) {
        setIsAuthenticated(true);
      } else {
        setError(result.error || 'Invalid API key');
        api.clearAdminKey();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
      api.clearAdminKey();
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    api.clearAdminKey();
    setIsAuthenticated(false);
    setApiKeyForm('');
  };

  const handleIssueCredential = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');
    setOfferQR('');
    try {
      const result = await api.issueCredential({
        student_id: credForm.studentId,
        credential_type: 'DegreeCredential',
        credential_subject: {
          university: credForm.university,
          degree: credForm.degree,
          major: credForm.major,
          graduationYear: parseInt(credForm.graduationYear.toString()),
          ...(credForm.gpa && { gpa: parseFloat(credForm.gpa) }),
          ...(credForm.honors && { honors: credForm.honors }),
        },
        expiration_date: new Date(new Date().setFullYear(new Date().getFullYear() + 10)),
      });
      if (result.success) {
        setSuccess('Credential issued successfully!');
        setOfferQR(result.offer_qr_data?.qr_code_url || '');
        setCredForm({
          studentId: '',
          university: 'Arizona State University',
          degree: 'Master of Science',
          major: 'Computer Science',
          graduationYear: new Date().getFullYear(),
          gpa: '',
          honors: '',
        });
      } else {
        setError(result.error || 'Issuance failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Issuance failed');
    } finally {
      setLoading(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-linear-to-br from-gray-900 to-gray-800">
        <div className="container mx-auto px-4 py-8">
          <div className="mb-8">
            <Link href="/" className="text-purple-400 hover:underline">
              Home
            </Link>
          </div>
          <div className="max-w-md mx-auto">
            <header className="text-center mb-8">
              <h1 className="text-4xl font-bold text-white mb-2">
                University Admin Portal
              </h1>
              <p className="text-gray-300">
                Enter your API key to access the admin portal
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
                    Admin API Key
                  </label>
                  <input
                    type="password"
                    value={apiKeyForm}
                    onChange={(e) => setApiKeyForm(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-600 rounded-lg bg-gray-700 text-white"
                    required
                    placeholder="Enter your admin API key"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-6 rounded-lg disabled:opacity-50"
                >
                  {loading ? 'Authenticating...' : 'Login'}
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
          <Link href="/" className="text-purple-400 hover:underline">
            Home
          </Link>
          <button
            onClick={handleLogout}
            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm"
          >
            Logout
          </button>
        </div>
        <div className="max-w-6xl mx-auto">
          <header className="text-center mb-8">
            <h1 className="text-4xl font-bold text-white mb-2">
              University Admin Portal
            </h1>
            <p className="text-gray-300">
              Issue and manage student credentials
            </p>
          </header>
          <div className="bg-gray-800 rounded-lg shadow-lg overflow-hidden">
            <div className="border-b border-gray-700">
              <div className="flex">
                <button
                  onClick={() => setActiveTab('issue')}
                  className={`flex-1 px-6 py-4 font-semibold ${
                    activeTab === 'issue'
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-700 text-gray-300'
                  }`}
                >
                  Issue Credential
                </button>
                <button
                  onClick={() => setActiveTab('manage')}
                  className={`flex-1 px-6 py-4 font-semibold ${
                    activeTab === 'manage'
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-700 text-gray-300'
                  }`}
                >
                  Manage Credentials
                </button>
              </div>
            </div>
            <div className="p-8">
              {error && (
                <div className="bg-red-900 border border-red-700 text-red-200 px-4 py-3 rounded mb-4">
                  {error}
                </div>
              )}
              {success && (
                <div className="bg-green-900 border border-green-700 text-green-200 px-4 py-3 rounded mb-4">
                  {success}
                </div>
              )}
              {activeTab === 'issue' && (
                <div>
                  <h2 className="text-2xl font-bold text-white mb-6">
                    Issue New Credential
                  </h2>
                  <form onSubmit={handleIssueCredential} className="space-y-6">
                    <div className="grid md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-gray-300 mb-2 font-semibold">
                          Student ID
                        </label>
                        <input
                          type="text"
                          value={credForm.studentId}
                          onChange={(e) =>
                            setCredForm({ ...credForm, studentId: e.target.value })
                          }
                          className="w-full px-4 py-2 border border-gray-600 rounded-lg bg-gray-700 text-white"
                          required
                          placeholder="STU123456"
                        />
                      </div>
                      <div>
                        <label className="block text-gray-300 mb-2 font-semibold">
                          University
                        </label>
                        <input
                          type="text"
                          value={credForm.university}
                          onChange={(e) =>
                            setCredForm({ ...credForm, university: e.target.value })
                          }
                          className="w-full px-4 py-2 border border-gray-600 rounded-lg bg-gray-700 text-white"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-gray-300 mb-2 font-semibold">
                          Degree
                        </label>
                        <select
                          value={credForm.degree}
                          onChange={(e) =>
                            setCredForm({ ...credForm, degree: e.target.value })
                          }
                          className="w-full px-4 py-2 border border-gray-600 rounded-lg bg-gray-700 text-white"
                          required
                        >
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
                          value={credForm.major}
                          onChange={(e) =>
                            setCredForm({ ...credForm, major: e.target.value })
                          }
                          className="w-full px-4 py-2 border border-gray-600 rounded-lg bg-gray-700 text-white"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-gray-300 mb-2 font-semibold">
                          Graduation Year
                        </label>
                        <input
                          type="number"
                          value={credForm.graduationYear}
                          onChange={(e) =>
                            setCredForm({
                              ...credForm,
                              graduationYear: parseInt(e.target.value),
                            })
                          }
                          className="w-full px-4 py-2 border border-gray-600 rounded-lg bg-gray-700 text-white"
                          required
                          min="1900"
                          max={new Date().getFullYear() + 10}
                        />
                      </div>
                      <div>
                        <label className="block text-gray-300 mb-2 font-semibold">
                          GPA
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={credForm.gpa}
                          onChange={(e) =>
                            setCredForm({ ...credForm, gpa: e.target.value })
                          }
                          className="w-full px-4 py-2 border border-gray-600 rounded-lg bg-gray-700 text-white"
                          placeholder="3.75"
                          min="0"
                          max="4"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-gray-300 mb-2 font-semibold">
                          Honors
                        </label>
                        <input
                          type="text"
                          value={credForm.honors}
                          onChange={(e) =>
                            setCredForm({ ...credForm, honors: e.target.value })
                          }
                          className="w-full px-4 py-2 border border-gray-600 rounded-lg bg-gray-700 text-white"
                          placeholder="Summa Cum Laude"
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-6 rounded-lg disabled:opacity-50"
                    >
                      {loading ? 'Loading...' : 'Issue Credential'}
                    </button>
                  </form>
                  {offerQR && (
                    <div className="mt-8 p-6 bg-green-900 rounded-lg">
                      <h3 className="text-lg font-bold text-green-200 mb-4">
                        Credential Issued
                      </h3>
                      <p className="text-sm text-green-300 mb-4">
                        Student scans QR with Privado ID to claim credential
                      </p>
                      <div className="bg-white p-4 rounded-lg flex justify-center">
                        <QRCodeSVG value={offerQR} size={200} level="M" />
                      </div>
                      <p className="text-xs text-green-400 mt-2 text-center break-all">
                        {offerQR}
                      </p>
                    </div>
                  )}
                </div>
              )}
              {activeTab === 'manage' && (
                <div>
                  <h2 className="text-2xl font-bold text-white mb-6">
                    Manage Issued Credentials
                  </h2>
                  {credentials.length === 0 ? (
                    <div className="bg-gray-700 rounded-lg p-6">
                      <p className="text-gray-300">
                        No credentials found.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead className="bg-gray-700">
                          <tr>
                            <th className="px-4 py-3 text-gray-300 font-semibold">Student ID</th>
                            <th className="px-4 py-3 text-gray-300 font-semibold">Type</th>
                            <th className="px-4 py-3 text-gray-300 font-semibold">Issued</th>
                            <th className="px-4 py-3 text-gray-300 font-semibold">Status</th>
                            <th className="px-4 py-3 text-gray-300 font-semibold">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700">
                          {credentials.map((cred) => (
                            <tr key={cred.id} className="hover:bg-gray-750">
                              <td className="px-4 py-3 text-gray-300">{cred.student_id}</td>
                              <td className="px-4 py-3 text-gray-300">{cred.credential_type}</td>
                              <td className="px-4 py-3 text-gray-400 text-sm">
                                {new Date(cred.issued_at).toLocaleDateString()}
                              </td>
                              <td className="px-4 py-3">
                                {cred.is_revoked ? (
                                  <span className="px-2 py-1 text-xs rounded bg-red-900 text-red-200">
                                    Revoked
                                  </span>
                                ) : (
                                  <span className="px-2 py-1 text-xs rounded bg-green-900 text-green-200">
                                    Active
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                {!cred.is_revoked && (
                                  <button
                                    onClick={() => setRevokeModal({ credId: cred.id, reason: '' })}
                                    className="text-red-400 hover:text-red-300 text-sm"
                                  >
                                    Revoke
                                  </button>
                                )}
                                {cred.is_revoked && cred.revocation_reason && (
                                  <span className="text-xs text-gray-500" title={cred.revocation_reason}>
                                    {cred.revocation_reason.substring(0, 20)}...
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
              {revokeModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                  <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
                    <h3 className="text-xl font-bold text-white mb-4">Revoke Credential</h3>
                    <textarea
                      value={revokeModal.reason}
                      onChange={(e) => setRevokeModal({ ...revokeModal, reason: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-600 rounded-lg bg-gray-700 text-white mb-4"
                      placeholder="Reason for revocation"
                      rows={3}
                      required
                    />
                    <div className="flex justify-end gap-3">
                      <button
                        onClick={() => setRevokeModal(null)}
                        className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-500"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleRevokeCred}
                        disabled={!revokeModal.reason || loading}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-500 disabled:opacity-50"
                      >
                        {loading ? 'Revoking...' : 'Revoke'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
