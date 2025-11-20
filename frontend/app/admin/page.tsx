'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api } from '../../lib/api';

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

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const result = await api.verifyAdminKey();
        setIsAuthenticated(result.success);
      } catch {
        setIsAuthenticated(false);
      }
    };
    checkAuth();
  }, []);

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
        studentId: credForm.studentId,
        credentialType: 'DegreeCredential',
        credentialSubject: {
          university: credForm.university,
          degree: credForm.degree,
          major: credForm.major,
          graduationYear: parseInt(credForm.graduationYear.toString()),
          ...(credForm.gpa && { gpa: parseFloat(credForm.gpa) }),
          ...(credForm.honors && { honors: credForm.honors }),
        },
        expirationDate: new Date(new Date().setFullYear(new Date().getFullYear() + 10)),
      });
      if (result.success) {
        setSuccess('Credential issued successfully!');
        setOfferQR(result.offerQRData?.qrCodeUrl || '');
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
                      <div className="bg-white p-4 rounded inline-block">
                        <div className="text-center">
                          <div className="text-6xl mb-2">📱</div>
                          <code className="text-xs bg-gray-100 px-2 py-1 rounded break-all block">
                            {offerQR}
                          </code>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {activeTab === 'manage' && (
                <div>
                  <h2 className="text-2xl font-bold text-white mb-6">
                    Manage Issued Credentials
                  </h2>
                  <div className="bg-gray-700 rounded-lg p-6">
                    <p className="text-gray-300">
                      No credentials found. Issue your first credential to see it here.
                    </p>
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
