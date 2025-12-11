import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Eye, EyeOff, CheckCircle, XCircle } from 'lucide-react';
import { api } from '@/api/client';
import toast from 'react-hot-toast';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(true);
  const [isValid, setIsValid] = useState(false);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [isComplete, setIsComplete] = useState(false);

  // Verify token on mount
  useEffect(() => {
    const verifyToken = async () => {
      if (!token) {
        setIsVerifying(false);
        setError('No reset token provided');
        return;
      }

      try {
        const response = await api.post<{ valid: boolean; email: string; message?: string }>(
          '/auth/verify-reset-token',
          { token }
        );

        if (response.valid) {
          setIsValid(true);
          setEmail(response.email);
        } else {
          setError(response.message || 'Invalid or expired reset link');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Invalid or expired reset link');
      } finally {
        setIsVerifying(false);
      }
    };

    verifyToken();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setIsLoading(true);

    try {
      await api.post('/auth/reset-password', { token, password });
      setIsComplete(true);
      toast.success('Password reset successfully!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset password');
    } finally {
      setIsLoading(false);
    }
  };

  // Loading state
  if (isVerifying) {
    return (
      <div className="space-y-8 text-center">
        <Loader2 className="w-12 h-12 animate-spin text-primary-600 mx-auto" />
        <p className="text-gray-500">Verifying reset link...</p>
      </div>
    );
  }

  // Invalid token
  if (!isValid && !isComplete) {
    return (
      <div className="space-y-8">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <XCircle className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Invalid Reset Link</h2>
          <p className="text-gray-500 mt-2">
            {error || 'This password reset link is invalid or has expired.'}
          </p>
        </div>

        <div className="space-y-3">
          <Link to="/forgot-password" className="btn-primary w-full justify-center">
            Request a new link
          </Link>
          <Link to="/login" className="btn-secondary w-full justify-center">
            Return to sign in
          </Link>
        </div>
      </div>
    );
  }

  // Success state
  if (isComplete) {
    return (
      <div className="space-y-8">
        <div className="text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Password Reset!</h2>
          <p className="text-gray-500 mt-2">
            Your password has been reset successfully. You can now sign in with your new password.
          </p>
        </div>

        <Link to="/login" className="btn-primary w-full justify-center">
          Sign in
        </Link>
      </div>
    );
  }

  // Reset form
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
        <h2 className="text-2xl font-bold text-gray-900">Set new password</h2>
        <p className="text-gray-500 mt-1">
          Create a new password for <strong>{email}</strong>
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
            htmlFor="password"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            New password
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input pr-10"
              placeholder="Enter new password"
              required
              minLength={8}
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <p className="mt-1 text-xs text-gray-500">Must be at least 8 characters</p>
        </div>

        <div>
          <label
            htmlFor="confirmPassword"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Confirm password
          </label>
          <input
            id="confirmPassword"
            type={showPassword ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="input"
            placeholder="Confirm new password"
            required
            autoComplete="new-password"
          />
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="btn-primary w-full"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Resetting password...
            </>
          ) : (
            'Reset password'
          )}
        </button>
      </form>
    </div>
  );
}
