/**
 * Shared API Client
 *
 * Phase 3.1: Frontend Code Consolidation
 *
 * Unified HTTP client for making API requests across web and portal apps.
 * Handles authentication, error responses, and common request patterns.
 */

export interface RequestOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>;
}

export interface ApiClientConfig {
  baseUrl: string;
  getToken: () => string | null | undefined;
  onUnauthorized?: () => void;
  /** Callback when token is refreshed - update your auth store with new token */
  onTokenRefreshed?: (newToken: string) => void;
  /** Enable CSRF token handling (double-submit cookie pattern) */
  enableCsrf?: boolean;
}

export interface ApiErrorResponse {
  message?: string;
  code?: string;
  details?: unknown;
}

/**
 * HTTP API Client
 *
 * Generic client for making authenticated API requests with automatic
 * error handling, token injection, and response parsing.
 *
 * @example
 * ```ts
 * const client = new ApiClient({
 *   baseUrl: '/api',
 *   getToken: () => useAuthStore.getState().accessToken,
 *   onUnauthorized: () => {
 *     useAuthStore.getState().logout();
 *     window.location.href = '/login';
 *   }
 * });
 *
 * const data = await client.get('/users');
 * ```
 */
export class ApiClient {
  private baseUrl: string;
  private getToken: () => string | null | undefined;
  private onUnauthorized?: () => void;
  private onTokenRefreshed?: (newToken: string) => void;
  private enableCsrf: boolean;

  // Token refresh state
  private isRefreshing = false;
  private refreshPromise: Promise<boolean> | null = null;

  constructor(config: ApiClientConfig) {
    this.baseUrl = config.baseUrl;
    this.getToken = config.getToken;
    this.onUnauthorized = config.onUnauthorized;
    this.onTokenRefreshed = config.onTokenRefreshed;
    this.enableCsrf = config.enableCsrf ?? true;
  }

  /**
   * Attempt to refresh the access token using refresh token cookie.
   * Returns true if refresh succeeded, false otherwise.
   * Deduplicates concurrent refresh attempts.
   */
  private async refreshAccessToken(): Promise<boolean> {
    // If already refreshing, wait for that attempt
    if (this.isRefreshing && this.refreshPromise) {
      return this.refreshPromise;
    }

    this.isRefreshing = true;
    this.refreshPromise = (async () => {
      try {
        const response = await fetch(`${this.baseUrl}/auth/refresh`, {
          method: 'POST',
          credentials: 'include', // Include refresh token cookie
          headers: { 'Content-Type': 'application/json' },
        });

        if (response.ok) {
          const data = await response.json();
          // Notify the app of the new token
          if (this.onTokenRefreshed && data.accessToken) {
            this.onTokenRefreshed(data.accessToken);
          }
          return true;
        }
        return false;
      } catch {
        return false;
      } finally {
        this.isRefreshing = false;
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  /**
   * Extract CSRF token from cookies for double-submit pattern
   */
  private getCsrfToken(): string | null {
    if (typeof document === 'undefined') return null;
    const match = document.cookie.match(/csrf_token=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }

  /**
   * Refresh CSRF token - call after login or when token expires
   */
  async refreshCsrfToken(): Promise<void> {
    try {
      await this.get<{ token: string }>('/csrf-token');
    } catch (error) {
      console.warn('Failed to refresh CSRF token:', error);
    }
  }

  /**
   * Get request headers with auth token and optional CSRF token
   */
  private getHeaders(method: string = 'GET', excludeContentType = false): HeadersInit {
    const headers: HeadersInit = {};

    if (!excludeContentType) {
      headers['Content-Type'] = 'application/json';
    }

    const token = this.getToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    // Add CSRF token for state-changing requests (double-submit cookie pattern)
    if (this.enableCsrf && !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase())) {
      const csrfToken = this.getCsrfToken();
      if (csrfToken) {
        headers['x-csrf-token'] = csrfToken;
      }
    }

    return headers;
  }

  /**
   * Build full URL with query parameters
   */
  private buildUrl(
    endpoint: string,
    params?: Record<string, string | number | boolean | undefined>
  ): string {
    const url = new URL(`${this.baseUrl}${endpoint}`, window.location.origin);

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value));
        }
      });
    }

    return url.toString();
  }

  /**
   * Handle API response with error checking and automatic token refresh on 401.
   * @param response - The fetch response
   * @param retryFn - Optional function to retry the request after token refresh
   */
  private async handleResponse<T>(
    response: Response,
    retryFn?: () => Promise<Response>
  ): Promise<T> {
    // Handle 401 Unauthorized - try token refresh first
    if (response.status === 401) {
      // Only try refresh if we have a retry function (first attempt)
      if (retryFn) {
        const refreshed = await this.refreshAccessToken();
        if (refreshed) {
          // Token refreshed successfully - retry the original request
          const retryResponse = await retryFn();
          // Don't pass retryFn to prevent infinite loops
          return this.handleResponse<T>(retryResponse);
        }
      }

      // Refresh failed or not available - redirect to login
      if (this.onUnauthorized) {
        this.onUnauthorized();
      }
      throw new Error('Session expired - please log in again');
    }

    // Check content type to avoid JSON parse errors on HTML error pages
    const contentType = response.headers.get('content-type');
    const isJson = contentType?.includes('application/json');

    if (!isJson) {
      // Server returned non-JSON (likely HTML error page)
      const text = await response.text();
      console.error('Non-JSON response:', text.substring(0, 500));

      // Provide user-friendly error messages for common HTTP errors
      if (response.status === 413) {
        throw new Error('File too large. Maximum size is 50MB.');
      } else if (response.status === 404) {
        throw new Error('API endpoint not found. Please contact support.');
      } else if (response.status >= 500) {
        throw new Error('Server error. Please try again later.');
      }

      throw new Error(`Server error (${response.status}). Please try again.`);
    }

    // Parse JSON response
    const data = await response.json();

    // Check for API errors
    if (!response.ok) {
      const errorData = data as ApiErrorResponse;
      const errorMessage =
        errorData.message || errorData.code || 'An error occurred';
      throw new Error(errorMessage);
    }

    return data as T;
  }

  /**
   * GET request with automatic token refresh on 401
   */
  async get<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    const url = this.buildUrl(endpoint, options?.params);

    const makeRequest = () =>
      fetch(url, {
        method: 'GET',
        headers: this.getHeaders('GET'),
        credentials: 'include',
        ...options,
      });

    const response = await makeRequest();
    return this.handleResponse<T>(response, makeRequest);
  }

  /**
   * POST request with automatic token refresh on 401
   */
  async post<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<T> {
    const url = this.buildUrl(endpoint, options?.params);

    const makeRequest = () =>
      fetch(url, {
        method: 'POST',
        headers: this.getHeaders('POST'),
        credentials: 'include',
        body: body ? JSON.stringify(body) : undefined,
        ...options,
      });

    const response = await makeRequest();
    return this.handleResponse<T>(response, makeRequest);
  }

  /**
   * PUT request with automatic token refresh on 401
   */
  async put<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<T> {
    const url = this.buildUrl(endpoint, options?.params);

    const makeRequest = () =>
      fetch(url, {
        method: 'PUT',
        headers: this.getHeaders('PUT'),
        credentials: 'include',
        body: body ? JSON.stringify(body) : undefined,
        ...options,
      });

    const response = await makeRequest();
    return this.handleResponse<T>(response, makeRequest);
  }

  /**
   * PATCH request with automatic token refresh on 401
   */
  async patch<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<T> {
    const url = this.buildUrl(endpoint, options?.params);

    const makeRequest = () =>
      fetch(url, {
        method: 'PATCH',
        headers: this.getHeaders('PATCH'),
        credentials: 'include',
        body: body ? JSON.stringify(body) : undefined,
        ...options,
      });

    const response = await makeRequest();
    return this.handleResponse<T>(response, makeRequest);
  }

  /**
   * DELETE request with automatic token refresh on 401
   */
  async delete<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    const url = this.buildUrl(endpoint, options?.params);

    const makeRequest = () =>
      fetch(url, {
        method: 'DELETE',
        headers: this.getHeaders('DELETE'),
        credentials: 'include',
        ...options,
      });

    const response = await makeRequest();
    return this.handleResponse<T>(response, makeRequest);
  }

  /**
   * Upload a single file with automatic token refresh on 401
   */
  async upload<T>(
    endpoint: string,
    file: File,
    additionalData?: Record<string, string>
  ): Promise<T> {
    const makeRequest = () => {
      const formData = new FormData();
      formData.append('file', file);

      if (additionalData) {
        Object.entries(additionalData).forEach(([key, value]) => {
          formData.append(key, value);
        });
      }

      const headers = this.getHeaders('POST', true); // Exclude Content-Type for FormData

      return fetch(`${this.baseUrl}${endpoint}`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: formData,
      });
    };

    const response = await makeRequest();
    return this.handleResponse<T>(response, makeRequest);
  }

  /**
   * Upload multiple files with automatic token refresh on 401
   */
  async uploadMultiple<T>(
    endpoint: string,
    files: File[],
    additionalData?: Record<string, string>
  ): Promise<T> {
    const makeRequest = () => {
      const formData = new FormData();

      files.forEach((f) => {
        formData.append('files', f);
      });

      if (additionalData) {
        Object.entries(additionalData).forEach(([key, value]) => {
          formData.append(key, value);
        });
      }

      const headers = this.getHeaders('POST', true); // Exclude Content-Type for FormData

      return fetch(`${this.baseUrl}${endpoint}`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: formData,
      });
    };

    const response = await makeRequest();
    return this.handleResponse<T>(response, makeRequest);
  }
}

/**
 * Create a preconfigured API client instance
 *
 * @param config - Client configuration
 * @returns Configured API client
 */
export function createApiClient(config: ApiClientConfig): ApiClient {
  return new ApiClient(config);
}
