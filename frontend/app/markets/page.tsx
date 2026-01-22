'use client';

import Link from 'next/link';

export default function Markets() {
  return (
    <main className="min-h-screen p-8 bg-gradient-to-b from-blue-50 to-white">
      <div className="max-w-4xl mx-auto">
        <Link href="/" className="text-blue-600 hover:underline mb-4 inline-block">
          ← Back to Home
        </Link>

        <h1 className="text-4xl font-bold mb-8">Active Markets</h1>

        <div className="bg-white p-8 rounded-lg shadow text-center">
          <p className="text-gray-600 mb-4">
            Markets list will be implemented in next iteration
          </p>
          <Link
            href="/create"
            className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Create First Market
          </Link>
        </div>
      </div>
    </main>
  );
}
