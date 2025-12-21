// =============================================================================
// ENVIRONMENT VARIABLE VALIDATION
// =============================================================================
// Validates required environment variables at application startup.
// Fails fast if critical configuration is missing.

const requiredEnvVars = [
  'JWT_SECRET',
  'DATABASE_URL',
] as const;

const optionalEnvVars = [
  'REDIS_URL',
  'PORT',
  'NODE_ENV',
  'FRONTEND_URL',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASS',
] as const;

interface ValidationResult {
  valid: boolean;
  missing: string[];
  warnings: string[];
}

/**
 * Validate that all required environment variables are set
 * @throws {Error} If any required variable is missing
 */
export function validateEnvironment(): ValidationResult {
  const missing: string[] = [];
  const warnings: string[] = [];

  // Check required variables
  for (const varName of requiredEnvVars) {
    if (!process.env[varName]) {
      missing.push(varName);
    }
  }

  // Check optional but recommended variables
  for (const varName of optionalEnvVars) {
    if (!process.env[varName]) {
      warnings.push(`Optional environment variable ${varName} is not set`);
    }
  }

  // Validate JWT_SECRET strength
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    warnings.push('JWT_SECRET should be at least 32 characters for security');
  }

  // Warn about development secrets in production
  if (
    process.env.NODE_ENV === 'production' &&
    process.env.JWT_SECRET?.includes('development')
  ) {
    throw new Error(
      'FATAL: Development JWT_SECRET detected in production environment'
    );
  }

  const result: ValidationResult = {
    valid: missing.length === 0,
    missing,
    warnings,
  };

  if (!result.valid) {
    const errorMessage = `
╔═══════════════════════════════════════════════════════════════════╗
║                   ENVIRONMENT VALIDATION FAILED                   ║
╚═══════════════════════════════════════════════════════════════════╝

Missing required environment variables:
${missing.map(v => `  • ${v}`).join('\n')}

Please set these variables in your .env file or environment.

For more information, see: docs/ENVIRONMENT.md
`;

    throw new Error(errorMessage);
  }

  return result;
}

/**
 * Print warnings about optional environment variables
 */
export function printEnvironmentWarnings(warnings: string[]): void {
  if (warnings.length === 0) return;

  console.warn('\n⚠️  Environment Warnings:');
  warnings.forEach(warning => {
    console.warn(`  • ${warning}`);
  });
  console.warn('');
}
