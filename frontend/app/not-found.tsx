import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-gray-900 dark:text-white mb-4">404</h1>
        <h2 className="text-2xl font-semibold text-gray-700 dark:text-gray-300 mb-4">Page Not Found</h2>
        <Link
          href="/"
          className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg"
        >
          Go To Homepage
        </Link>
      </div>
    </div>
  );
}
