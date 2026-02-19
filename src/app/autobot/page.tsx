'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function AutobotContent() {
  const searchParams = useSearchParams();
  const success = searchParams.get('success');
  const error = searchParams.get('error');
  const location = searchParams.get('location');

  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
      <div className="max-w-md w-full p-8">
        <h1 className="text-3xl font-bold mb-2">🤖 Autobot</h1>
        <p className="text-gray-400 mb-8">GHL Automation & Debugging Access</p>

        {success && (
          <div className="bg-green-900/50 border border-green-500 rounded-lg p-4 mb-6">
            <p className="text-green-400">✅ Successfully authorized!</p>
            {location && <p className="text-sm text-gray-400 mt-1">Location: {location}</p>}
          </div>
        )}

        {error && (
          <div className="bg-red-900/50 border border-red-500 rounded-lg p-4 mb-6">
            <p className="text-red-400">❌ Error: {error}</p>
          </div>
        )}

        <div className="space-y-4">
          <a
            href="/api/autobot/authorize"
            className="block w-full bg-blue-600 hover:bg-blue-700 text-center py-3 px-4 rounded-lg font-medium transition"
          >
            Connect GHL Location
          </a>
          
          <div className="text-sm text-gray-500 mt-4">
            <p className="font-medium mb-2">Authorized Scopes:</p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li>workflows.readonly</li>
              <li>locations/tags.readonly + write</li>
              <li>contacts, opportunities, conversations</li>
              <li>calendars, invoices, forms, surveys</li>
              <li>... and more</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AutobotPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-900 flex items-center justify-center text-white">Loading...</div>}>
      <AutobotContent />
    </Suspense>
  );
}
