import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { useAuthStore, User } from '@/stores/auth.store';
import { AuthState } from '@inventory/shared/stores';
import { api } from '@/api/client';
import toast from 'react-hot-toast';

type AuthStateUser = AuthState<User>;

interface LoginResponse {
  user: {
    id: string;
    email: string;
    name: string;
    role: 'admin' | 'operations_manager' | 'account_manager';
  };
  accessToken: string;
}

export default function Login() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((state: AuthStateUser) => state.setAuth);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await api.post<LoginResponse>('/auth/login', {
        email,
        password,
      });

      setAuth(response.user, response.accessToken);

      // Fetch CSRF token for subsequent requests
      await api.refreshCsrfToken();

      toast.success(`Welcome back, ${response.user.name}!`);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Mobile logo */}
      <div className="lg:hidden text-center">
        <h1 className="text-2xl font-bold text-gray-900">Inventory IQ</h1>
        <p className="text-gray-500 mt-1">Intelligent Inventory Management</p>
      </div>

      <div>
        <h2 className="text-2xl font-bold text-gray-900">Welcome back</h2>
        <p className="text-gray-500 mt-1">
          Sign in to your account to continue
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
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
            placeholder="you@company.com"
            required
            autoComplete="email"
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input pr-10"
              placeholder="Enter your password"
              required
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showPassword ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm text-gray-600">Remember me</span>
          </label>
          <Link
            to="/forgot-password"
            className="text-sm text-primary-600 hover:text-primary-700"
          >
            Forgot password?
          </Link>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="btn-primary w-full"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Signing in...
            </>
          ) : (
            'Sign in'
          )}
        </button>
      </form>

      <p className="text-center text-sm text-gray-500">
        Don't have an account?{' '}
        <button className="text-primary-600 hover:text-primary-700 font-medium">
          Contact your administrator
        </button>
      </p>

      {/* Demo Account */}
      <div className="mt-6 pt-6 border-t border-gray-200">
        <p className="text-center text-xs text-gray-400 mb-2">Want to explore?</p>
        <button
          type="button"
          onClick={() => {
            setEmail('sarah.chen@inventoryiq.com');
            setPassword('Admin2025!');
          }}
          className="w-full py-2.5 px-4 text-sm text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-200 transition-colors"
        >
          <span className="font-medium">Demo Account</span>
          <span className="block text-xs text-gray-400 mt-0.5">View sample inventory data</span>
        </button>
      </div>
    </div>
  );
}
