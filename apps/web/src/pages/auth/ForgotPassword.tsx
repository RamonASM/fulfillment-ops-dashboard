import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Loader2, Mail, CheckCircle } from 'lucide-react';
import { api } from '@/api/client';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [debugInfo, setDebugInfo] = useState<{ token?: string; resetUrl?: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await api.post<{ message: string; debug?: { token: string; resetUrl: string } }>(
        '/auth/forgot-password',
        { email, userType: 'admin' }
      );

      setIsSubmitted(true);
      // In dev mode, the API returns debug info with the reset URL
      if (response.debug) {
        setDebugInfo(response.debug);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send reset email');
    } finally {
      setIsLoading(false);
    }
  };

  if (isSubmitted) {
    return (
      <div className="space-y-8">
        <div className="text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Check your email</h2>
          <p className="text-gray-500 mt-2">
            If an account exists with <strong>{email}</strong>, we've sent password reset instructions.
          </p>
        </div>

        {/* Debug info for development/demo */}
        {debugInfo && (
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm font-medium text-blue-800 mb-2">Development Mode - Reset Link:</p>
            <a
              href={debugInfo.resetUrl}
              className="text-sm text-blue-600 hover:text-blue-700 break-all underline"
            >
              {debugInfo.resetUrl}
            </a>
          </div>
        )}

        <div className="space-y-3">
          <Link to="/login" className="btn-primary w-full justify-center">
            Return to sign in
          </Link>
          <button
            onClick={() => {
              setIsSubmitted(false);
              setDebugInfo(null);
            }}
            className="btn-secondary w-full"
          >
            Try another email
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Mobile logo */}
      <div className="lg:hidden text-center">
        <h1 className="text-2xl font-bold text-gray-900">Inventory IQ</h1>
        <p className="text-gray-500 mt-1">Intelligent Inventory Management</p>
      </div>

      <div>
        <Link
          to="/login"
          className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to sign in
        </Link>
        <h2 className="text-2xl font-bold text-gray-900">Reset your password</h2>
        <p className="text-gray-500 mt-1">
          Enter your email address and we'll send you a link to reset your password.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg">
            {error}
          </div>
        )}

        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Email address
          </label>
          <div className="relative">
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input pl-10"
              placeholder="you@company.com"
              required
              autoComplete="email"
            />
            <Mail className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          </div>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="btn-primary w-full"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Sending reset link...
            </>
          ) : (
            'Send reset link'
          )}
        </button>
      </form>
    </div>
  );
}
