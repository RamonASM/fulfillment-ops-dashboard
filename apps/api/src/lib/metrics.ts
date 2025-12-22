/**
 * Application Metrics
 *
 * Simple metrics collection for monitoring API performance.
 * Compatible with PM2's built-in monitoring and exposes a /metrics endpoint.
 *
 * Metrics tracked:
 * - HTTP request counts and latencies
 * - Import operation durations
 * - Rate limit hits
 * - Error counts by type
 */

import { Request, Response, NextFunction } from 'express';

// =============================================================================
// TYPES
// =============================================================================

interface HistogramBucket {
  le: number;
  count: number;
}

interface Histogram {
  sum: number;
  count: number;
  buckets: HistogramBucket[];
}

interface Counter {
  value: number;
  labels: Record<string, number>;
}

interface Metrics {
  httpRequestsTotal: Counter;
  httpRequestDuration: Histogram;
  httpRequestsInFlight: number;
  importDuration: Histogram;
  rateLimitHits: Counter;
  errorsTotal: Counter;
  startTime: number;
}

// =============================================================================
// METRICS STORAGE
// =============================================================================

const DEFAULT_BUCKETS = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

function createHistogram(buckets: number[] = DEFAULT_BUCKETS): Histogram {
  return {
    sum: 0,
    count: 0,
    buckets: buckets.map((le) => ({ le, count: 0 })),
  };
}

function createCounter(): Counter {
  return {
    value: 0,
    labels: {},
  };
}

const metrics: Metrics = {
  httpRequestsTotal: createCounter(),
  httpRequestDuration: createHistogram(),
  httpRequestsInFlight: 0,
  importDuration: createHistogram([1, 5, 10, 30, 60, 120, 300, 600]),
  rateLimitHits: createCounter(),
  errorsTotal: createCounter(),
  startTime: Date.now(),
};

// =============================================================================
// METRIC OPERATIONS
// =============================================================================

function observeHistogram(histogram: Histogram, value: number): void {
  histogram.sum += value;
  histogram.count += 1;
  for (const bucket of histogram.buckets) {
    if (value <= bucket.le) {
      bucket.count += 1;
    }
  }
}

function incrementCounter(counter: Counter, label?: string): void {
  counter.value += 1;
  if (label) {
    counter.labels[label] = (counter.labels[label] || 0) + 1;
  }
}

// =============================================================================
// PUBLIC API
// =============================================================================

export const metricsCollector = {
  /**
   * Record HTTP request completion
   */
  recordRequest(method: string, path: string, statusCode: number, durationMs: number): void {
    const label = `${method}:${statusCode}`;
    incrementCounter(metrics.httpRequestsTotal, label);
    observeHistogram(metrics.httpRequestDuration, durationMs / 1000);
  },

  /**
   * Record import operation duration
   */
  recordImport(durationMs: number, success: boolean): void {
    const label = success ? 'success' : 'failure';
    incrementCounter(metrics.httpRequestsTotal, `import:${label}`);
    observeHistogram(metrics.importDuration, durationMs / 1000);
  },

  /**
   * Record rate limit hit
   */
  recordRateLimitHit(limiterName: string): void {
    incrementCounter(metrics.rateLimitHits, limiterName);
  },

  /**
   * Record error occurrence
   */
  recordError(errorType: string): void {
    incrementCounter(metrics.errorsTotal, errorType);
  },

  /**
   * Increment in-flight requests
   */
  incrementInFlight(): void {
    metrics.httpRequestsInFlight += 1;
  },

  /**
   * Decrement in-flight requests
   */
  decrementInFlight(): void {
    metrics.httpRequestsInFlight = Math.max(0, metrics.httpRequestsInFlight - 1);
  },

  /**
   * Get all metrics for export
   */
  getMetrics(): Record<string, unknown> {
    const uptimeSeconds = (Date.now() - metrics.startTime) / 1000;

    return {
      uptime_seconds: uptimeSeconds,
      http_requests_total: metrics.httpRequestsTotal.value,
      http_requests_by_status: metrics.httpRequestsTotal.labels,
      http_request_duration_seconds: {
        sum: metrics.httpRequestDuration.sum,
        count: metrics.httpRequestDuration.count,
        avg: metrics.httpRequestDuration.count > 0
          ? metrics.httpRequestDuration.sum / metrics.httpRequestDuration.count
          : 0,
      },
      http_requests_in_flight: metrics.httpRequestsInFlight,
      import_duration_seconds: {
        sum: metrics.importDuration.sum,
        count: metrics.importDuration.count,
        avg: metrics.importDuration.count > 0
          ? metrics.importDuration.sum / metrics.importDuration.count
          : 0,
      },
      rate_limit_hits_total: metrics.rateLimitHits.value,
      rate_limit_hits_by_limiter: metrics.rateLimitHits.labels,
      errors_total: metrics.errorsTotal.value,
      errors_by_type: metrics.errorsTotal.labels,
      memory_usage: process.memoryUsage(),
    };
  },

  /**
   * Get Prometheus-compatible text format
   */
  getPrometheusFormat(): string {
    const lines: string[] = [];
    const uptimeSeconds = (Date.now() - metrics.startTime) / 1000;

    // Uptime
    lines.push('# HELP inventory_uptime_seconds Time since server start');
    lines.push('# TYPE inventory_uptime_seconds gauge');
    lines.push(`inventory_uptime_seconds ${uptimeSeconds}`);

    // HTTP Requests
    lines.push('# HELP inventory_http_requests_total Total HTTP requests');
    lines.push('# TYPE inventory_http_requests_total counter');
    lines.push(`inventory_http_requests_total ${metrics.httpRequestsTotal.value}`);

    // HTTP Request Duration
    lines.push('# HELP inventory_http_request_duration_seconds HTTP request duration histogram');
    lines.push('# TYPE inventory_http_request_duration_seconds histogram');
    for (const bucket of metrics.httpRequestDuration.buckets) {
      lines.push(`inventory_http_request_duration_seconds_bucket{le="${bucket.le}"} ${bucket.count}`);
    }
    lines.push(`inventory_http_request_duration_seconds_bucket{le="+Inf"} ${metrics.httpRequestDuration.count}`);
    lines.push(`inventory_http_request_duration_seconds_sum ${metrics.httpRequestDuration.sum}`);
    lines.push(`inventory_http_request_duration_seconds_count ${metrics.httpRequestDuration.count}`);

    // In-flight requests
    lines.push('# HELP inventory_http_requests_in_flight Current in-flight HTTP requests');
    lines.push('# TYPE inventory_http_requests_in_flight gauge');
    lines.push(`inventory_http_requests_in_flight ${metrics.httpRequestsInFlight}`);

    // Rate limit hits
    lines.push('# HELP inventory_rate_limit_hits_total Total rate limit hits');
    lines.push('# TYPE inventory_rate_limit_hits_total counter');
    lines.push(`inventory_rate_limit_hits_total ${metrics.rateLimitHits.value}`);

    // Errors
    lines.push('# HELP inventory_errors_total Total errors');
    lines.push('# TYPE inventory_errors_total counter');
    lines.push(`inventory_errors_total ${metrics.errorsTotal.value}`);

    // Memory
    const mem = process.memoryUsage();
    lines.push('# HELP inventory_memory_bytes Memory usage in bytes');
    lines.push('# TYPE inventory_memory_bytes gauge');
    lines.push(`inventory_memory_bytes{type="heapUsed"} ${mem.heapUsed}`);
    lines.push(`inventory_memory_bytes{type="heapTotal"} ${mem.heapTotal}`);
    lines.push(`inventory_memory_bytes{type="rss"} ${mem.rss}`);

    return lines.join('\n');
  },

  /**
   * Reset all metrics (for testing)
   */
  reset(): void {
    metrics.httpRequestsTotal = createCounter();
    metrics.httpRequestDuration = createHistogram();
    metrics.httpRequestsInFlight = 0;
    metrics.importDuration = createHistogram([1, 5, 10, 30, 60, 120, 300, 600]);
    metrics.rateLimitHits = createCounter();
    metrics.errorsTotal = createCounter();
    metrics.startTime = Date.now();
  },
};

// =============================================================================
// EXPRESS MIDDLEWARE
// =============================================================================

/**
 * Middleware to track HTTP request metrics
 */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();
  metricsCollector.incrementInFlight();

  // Track response
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    metricsCollector.decrementInFlight();
    metricsCollector.recordRequest(req.method, req.path, res.statusCode, duration);

    // Track errors
    if (res.statusCode >= 500) {
      metricsCollector.recordError('5xx');
    } else if (res.statusCode >= 400) {
      metricsCollector.recordError('4xx');
    }
  });

  next();
}

/**
 * Route handler for /metrics endpoint
 */
export function metricsHandler(req: Request, res: Response): void {
  const acceptHeader = req.headers.accept || '';

  if (acceptHeader.includes('text/plain') || req.query.format === 'prometheus') {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(metricsCollector.getPrometheusFormat());
  } else {
    res.json(metricsCollector.getMetrics());
  }
}
