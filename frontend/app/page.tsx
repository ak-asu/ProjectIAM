import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen bg-linear-to-br from-gray-900 to-gray-800">
      <div className="container mx-auto px-4 py-16">
        <header className="text-center mb-16">
          <h1 className="text-5xl font-bold text-white mb-4">
            Unicredify
          </h1>
          <p className="text-xl text-gray-300 max-w-2xl mx-auto">
            Decentralized credential management for universities and students
          </p>
        </header>
        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          <Link href="/student" className="h-full">
            <div className="bg-gray-800 rounded-lg shadow-lg p-8 hover:shadow-xl transition-shadow cursor-pointer border-2 border-transparent hover:border-blue-500 h-full flex flex-col">
              <div className="text-4xl mb-4">👨‍🎓</div>
              <h2 className="text-2xl font-bold text-white mb-3">
                Student Portal
              </h2>
              <p className="text-gray-300 mb-4 grow">
                View and share your credentials with employers
              </p>
              <ul className="text-sm text-gray-400 space-y-2">
                <li>- Authenticate with DID</li>
                <li>- Manage credentials</li>
                <li>- Control what you share</li>
              </ul>
            </div>
          </Link>
          <Link href="/admin" className="h-full">
            <div className="bg-gray-800 rounded-lg shadow-lg p-8 hover:shadow-xl transition-shadow cursor-pointer border-2 border-transparent hover:border-purple-500 h-full flex flex-col">
              <div className="text-4xl mb-4">🏫</div>
              <h2 className="text-2xl font-bold text-white mb-3">
                University Portal
              </h2>
              <p className="text-gray-300 mb-4 grow">
                Issue and manage student credentials
              </p>
              <ul className="text-sm text-gray-400 space-y-2">
                <li>- Issue credentials</li>
                <li>- Track students</li>
                <li>- Revoke if needed</li>
              </ul>
            </div>
          </Link>
          <Link href="/employer" className="h-full">
            <div className="bg-gray-800 rounded-lg shadow-lg p-8 hover:shadow-xl transition-shadow cursor-pointer border-2 border-transparent hover:border-green-500 h-full flex flex-col">
              <div className="text-4xl mb-4">🏢</div>
              <h2 className="text-2xl font-bold text-white mb-3">
                Employer Portal
              </h2>
              <p className="text-gray-300 mb-4 grow">
                Verify credentials instantly
              </p>
              <ul className="text-sm text-gray-400 space-y-2">
                <li>- Quick verification</li>
                <li>- No university contact needed</li>
                <li>- Privacy-preserving</li>
              </ul>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
