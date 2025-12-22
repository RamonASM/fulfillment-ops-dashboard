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
  private enableCsrf: boolean;

  constructor(config: ApiClientConfig) {
    this.baseUrl = config.baseUrl;
    this.getToken = config.getToken;
    this.onUnauthorized = config.onUnauthorized;
    this.enableCsrf = config.enableCsrf ?? true;
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
   * Handle API response with error checking
   */
  private async handleResponse<T>(response: Response): Promise<T> {
    // Handle 401 Unauthorized
    if (response.status === 401) {
      if (this.onUnauthorized) {
        this.onUnauthorized();
      }
      throw new Error('Unauthorized - please log in again');
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
   * GET request
   */
  async get<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    const url = this.buildUrl(endpoint, options?.params);
    const response = await fetch(url, {
      method: 'GET',
      headers: this.getHeaders('GET'),
      credentials: 'include',
      ...options,
    });

    return this.handleResponse<T>(response);
  }

  /**
   * POST request
   */
  async post<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<T> {
    const url = this.buildUrl(endpoint, options?.params);
    const response = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders('POST'),
      credentials: 'include',
      body: body ? JSON.stringify(body) : undefined,
      ...options,
    });

    return this.handleResponse<T>(response);
  }

  /**
   * PUT request
   */
  async put<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<T> {
    const url = this.buildUrl(endpoint, options?.params);
    const response = await fetch(url, {
      method: 'PUT',
      headers: this.getHeaders('PUT'),
      credentials: 'include',
      body: body ? JSON.stringify(body) : undefined,
      ...options,
    });

    return this.handleResponse<T>(response);
  }

  /**
   * PATCH request
   */
  async patch<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<T> {
    const url = this.buildUrl(endpoint, options?.params);
    const response = await fetch(url, {
      method: 'PATCH',
      headers: this.getHeaders('PATCH'),
      credentials: 'include',
      body: body ? JSON.stringify(body) : undefined,
      ...options,
    });

    return this.handleResponse<T>(response);
  }

  /**
   * DELETE request
   */
  async delete<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    const url = this.buildUrl(endpoint, options?.params);
    const response = await fetch(url, {
      method: 'DELETE',
      headers: this.getHeaders('DELETE'),
      credentials: 'include',
      ...options,
    });

    return this.handleResponse<T>(response);
  }

  /**
   * Upload a single file
   */
  async upload<T>(
    endpoint: string,
    file: File,
    additionalData?: Record<string, string>
  ): Promise<T> {
    const formData = new FormData();
    formData.append('file', file);

    if (additionalData) {
      Object.entries(additionalData).forEach(([key, value]) => {
        formData.append(key, value);
      });
    }

    const headers = this.getHeaders('POST', true); // Exclude Content-Type for FormData

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: formData,
    });

    return this.handleResponse<T>(response);
  }

  /**
   * Upload multiple files
   */
  async uploadMultiple<T>(
    endpoint: string,
    files: File[],
    additionalData?: Record<string, string>
  ): Promise<T> {
    const formData = new FormData();

    files.forEach((file) => {
      formData.append('files', file);
    });

    if (additionalData) {
      Object.entries(additionalData).forEach(([key, value]) => {
        formData.append(key, value);
      });
    }

    const headers = this.getHeaders('POST', true); // Exclude Content-Type for FormData

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: formData,
    });

    return this.handleResponse<T>(response);
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
