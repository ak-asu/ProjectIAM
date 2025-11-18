'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '../../lib/api';

interface VerificationResult {
  verified: boolean;
  holderDID?: string;
  issuerDID?: string;
  credId?: string;
  verifiedAt: Date;
  checks: {
    proofValid: boolean;
    issuerAllowed: boolean;
    typeMatches: boolean;
    notRevoked: boolean;
    notExpired: boolean;
    constraintsSatisfied: boolean;
  };
  disclosedAttributes?: Record<string, unknown>;
  failureReason?: string;
  errors?: string[];
}

export default function EmployerPortal() {
  const [activeTab, setActiveTab] = useState<'verify' | 'history'>('verify');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [verifyForm, setVerifyForm] = useState({
    university: '',
    degree: '',
    major: '',
    minGraduationYear: '',
  });
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [verifyResult, setVerifyResult] = useState<VerificationResult | null>(null);

  const handleCreateVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setVerifyResult(null);
    try {
      const policy = {
        allowedIssuers: [process.env.NEXT_PUBLIC_ISSUER_DID || ''],
        credentialType: 'DegreeCredential',
        constraints: [
          ...(verifyForm.university
            ? [{
              field: 'credentialSubject.university',
              operator: '$eq' as const,
              value: verifyForm.university,
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

  return (
    <div className="min-h-screen bg-linear-to-br from-green-50 to-teal-100 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <Link href="/" className="text-green-600 dark:text-green-400 hover:underline">
            Home
          </Link>
        </div>
        <div className="max-w-6xl mx-auto">
          <header className="text-center mb-8">
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
              Employer Portal
            </h1>
            <p className="text-gray-600 dark:text-gray-300">
              Verify candidate credentials instantly
            </p>
          </header>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden">
            <div className="border-b border-gray-200 dark:border-gray-700">
              <div className="flex">
                <button
                  onClick={() => setActiveTab('verify')}
                  className={`flex-1 px-6 py-4 font-semibold ${activeTab === 'verify'
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                    }`}
                >
                  Verify Credential
                </button>
                <button
                  onClick={() => setActiveTab('history')}
                  className={`flex-1 px-6 py-4 font-semibold ${activeTab === 'history'
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                    }`}
                >
                  Verification History
                </button>
              </div>
            </div>
            <div className="p-8">
              {error && (
                <div className="bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-700 text-red-800 dark:text-red-200 px-4 py-3 rounded mb-4">
                  {error}
                </div>
              )}
              {activeTab === 'verify' && (
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
                    Create Verification Request
                  </h2>
                  {!qrCodeUrl && (
                    <form onSubmit={handleCreateVerification} className="space-y-6">
                      <div className="bg-blue-50 dark:bg-blue-900 border border-blue-200 dark:border-blue-700 rounded-lg p-4 mb-6">
                        <p className="text-sm text-blue-700 dark:text-blue-300">
                          Specify what credentials to verify (all optional), generate a QR code, and get instant verification via zero-knowledge proof
                        </p>
                      </div>
                      <div className="grid md:grid-cols-2 gap-6">
                        <div>
                          <label className="block text-gray-700 dark:text-gray-300 mb-2 font-semibold">
                            University
                          </label>
                          <input
                            type="text"
                            value={verifyForm.university}
                            onChange={(e) =>
                              setVerifyForm({ ...verifyForm, university: e.target.value })
                            }
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            placeholder="Any university"
                          />
                        </div>
                        <div>
                          <label className="block text-gray-700 dark:text-gray-300 mb-2 font-semibold">
                            Degree
                          </label>
                          <select
                            value={verifyForm.degree}
                            onChange={(e) =>
                              setVerifyForm({ ...verifyForm, degree: e.target.value })
                            }
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
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
                          <label className="block text-gray-700 dark:text-gray-300 mb-2 font-semibold">
                            Major
                          </label>
                          <input
                            type="text"
                            value={verifyForm.major}
                            onChange={(e) =>
                              setVerifyForm({ ...verifyForm, major: e.target.value })
                            }
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            placeholder="Any major"
                          />
                        </div>
                        <div>
                          <label className="block text-gray-700 dark:text-gray-300 mb-2 font-semibold">
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
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            placeholder="2020"
                            min="1900"
                            max={new Date().getFullYear() + 10}
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
                      <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                        Have Candidate Scan QR
                      </h3>
                      <p className="text-gray-600 dark:text-gray-300 mb-6">
                        Candidate scans with Privado ID wallet
                      </p>
                      <div className="bg-white p-8 rounded-lg inline-block">
                        <div className="text-center">
                          <div className="text-8xl mb-4">📱</div>
                          <p className="text-sm text-gray-500 mb-4">QR Code</p>
                          <code className="text-xs bg-gray-100 px-2 py-1 rounded break-all block">
                            {qrCodeUrl}
                          </code>
                        </div>
                      </div>
                      <p className="mt-6 text-sm text-gray-500">Waiting...</p>
                    </div>
                  )}
                  {verifyResult && (
                    <div className={`rounded-lg p-6 ${verifyResult.verified
                        ? 'bg-green-50 dark:bg-green-900 border border-green-200 dark:border-green-700'
                        : 'bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-700'
                      }`}>
                      <h3 className={`text-2xl font-bold mb-4 ${verifyResult.verified
                          ? 'text-green-800 dark:text-green-200'
                          : 'text-red-800 dark:text-red-200'
                        }`}>
                        {verifyResult.verified ? 'Verification Successful' : 'Verification Failed'}
                      </h3>
                      {verifyResult.verified && (
                        <div className="space-y-3 text-gray-700 dark:text-gray-300">
                          <div>
                            <span className="font-semibold">Holder DID:</span>{' '}
                            <code className="text-xs bg-white px-2 py-1 rounded">
                              {verifyResult.holderDID?.substring(0, 30)}...
                            </code>
                          </div>
                          {verifyResult.disclosedAttributes && (
                            <div>
                              <span className="font-semibold">Verified Information:</span>
                              <ul className="mt-2 space-y-1 ml-4">
                                {Object.entries(verifyResult.disclosedAttributes).map(([key, value]) => (
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
                        <p className="text-red-700 dark:text-red-300">
                          {verifyResult.failureReason || 'Verification failed'}
                        </p>
                      )}
                      <button
                        onClick={() => {
                          setQrCodeUrl('');
                          setVerifyResult(null);
                        }}
                        className="mt-6 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-6 py-2 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600"
                      >
                        Create New Verification
                      </button>
                    </div>
                  )}
                </div>
              )}
              {activeTab === 'history' && (
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
                    Verification History
                  </h2>
                  <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-6">
                    <p className="text-gray-600 dark:text-gray-300">
                      No history yet. Complete your first verification to see results here.
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
