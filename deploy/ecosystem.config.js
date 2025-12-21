// =============================================================================
// PM2 Ecosystem Configuration for Inventory Intelligence Platform
// =============================================================================
// This file defines PM2 process management for production deployments
// Usage:
//   - Start all: pm2 start ecosystem.config.js
//   - Start production: pm2 start ecosystem.config.js --env production
//   - Start staging: pm2 start ecosystem.config.js --env staging
// =============================================================================

module.exports = {
  apps: [
    // =========================================================================
    // API Server - Main Backend Service
    // =========================================================================
    {
      name: 'inventory-api',
      script: './apps/api/dist/index.js',
      cwd: '/var/www/inventory',
      instances: 'max',  // Use all available CPU cores
      exec_mode: 'cluster',

      // Environment variables (common)
      env: {
        NODE_ENV: 'development',
        PORT: 3001
      },

      // Staging environment
      env_staging: {
        NODE_ENV: 'staging',
        PORT: 3001
      },

      // Production environment
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001
      },

      // Load .env file
      env_file: '/var/www/inventory/.env',

      // Logging
      error_file: '/var/www/inventory/logs/api-error.log',
      out_file: '/var/www/inventory/logs/api-out.log',
      log_file: '/var/www/inventory/logs/api-combined.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // Performance & Monitoring
      max_memory_restart: '1G',  // Restart if memory exceeds 1GB
      min_uptime: '10s',         // Minimum uptime before considered stable
      max_restarts: 10,          // Max restart attempts
      restart_delay: 4000,       // Delay between restarts (ms)
      autorestart: true,
      watch: false,              // Disable watch in production

      // Advanced options
      listen_timeout: 10000,     // Time to wait for listen event
      kill_timeout: 300000,      // Time to wait before force kill (5 min for large imports)
      shutdown_with_message: true,

      // Process management
      wait_ready: true,          // Wait for process.send('ready')
      instance_var: 'INSTANCE_ID',

      // Cron restart (optional - restart daily at 3 AM)
      cron_restart: '0 3 * * *',

      // Health monitoring
      health_check_grace_period: 5000
    },

    // =========================================================================
    // Background Worker - Job Processing (Optional)
    // =========================================================================
    {
      name: 'inventory-worker',
      script: './apps/api/dist/worker.js',  // Create this file if using background jobs
      cwd: '/var/www/inventory',
      instances: 2,  // Limit worker instances
      exec_mode: 'cluster',

      env_production: {
        NODE_ENV: 'production',
        WORKER_CONCURRENCY: 5
      },

      env_file: '/var/www/inventory/.env',

      error_file: '/var/www/inventory/logs/worker-error.log',
      out_file: '/var/www/inventory/logs/worker-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

      max_memory_restart: '512M',
      autorestart: true,
      watch: false,

      // Only start in production
      disabled: process.env.NODE_ENV !== 'production'
    },

    // =========================================================================
    // ML Analytics Service - Python FastAPI (Alternative to Docker)
    // =========================================================================
    {
      name: 'inventory-ml',
      script: 'uvicorn',
      args: 'main:app --host 0.0.0.0 --port 8000 --workers 2',
      cwd: '/var/www/inventory/apps/ml-analytics',
      // Use absolute path to venv Python to avoid PATH issues
      interpreter: '/var/www/inventory/apps/ml-analytics/venv/bin/python3',
      instances: 1,
      exec_mode: 'fork',  // Python apps use fork mode

      env_production: {
        PORT: 8000,
        DATABASE_URL: 'postgresql://inventory:password@localhost:5432/inventory_db',
        LOG_LEVEL: 'info',
        // Ensure Python can find the venv packages
        PATH: '/var/www/inventory/apps/ml-analytics/venv/bin:/usr/local/bin:/usr/bin:/bin'
      },

      error_file: '/var/www/inventory/logs/ml-error.log',
      out_file: '/var/www/inventory/logs/ml-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

      max_memory_restart: '2G',
      autorestart: true,
      watch: false,

      // Optional: disable if using Docker for ML service
      disabled: false
    }
  ],

  // ===========================================================================
  // Deployment Configuration (PM2 Deploy)
  // ===========================================================================
  deploy: {
    // Production deployment
    production: {
      user: 'deploy',
      host: 'yourtechassist.us',
      ref: 'origin/main',
      repo: 'git@github.com:yourusername/fulfillment-ops-dashboard.git',
      path: '/var/www/inventory',

      // Pre-deployment commands
      'pre-deploy': 'git fetch --all',

      // Post-deployment commands
      'post-deploy': [
        'npm ci --production=false',
        'npm run db:generate',
        'npm run build',
        'pm2 reload ecosystem.config.js --env production',
        'pm2 save'
      ].join(' && '),

      // Environment variables
      env: {
        NODE_ENV: 'production'
      }
    },

    // Staging deployment
    staging: {
      user: 'deploy',
      host: 'staging.yourtechassist.us',
      ref: 'origin/staging',
      repo: 'git@github.com:yourusername/fulfillment-ops-dashboard.git',
      path: '/var/www/inventory-staging',

      'pre-deploy': 'git fetch --all',

      'post-deploy': [
        'npm ci',
        'npm run db:generate',
        'npm run build',
        'pm2 reload ecosystem.config.js --env staging',
        'pm2 save'
      ].join(' && '),

      env: {
        NODE_ENV: 'staging'
      }
    }
  }
};

// =============================================================================
// Usage Examples:
// =============================================================================
//
// Start all apps in production:
//   pm2 start ecosystem.config.js --env production
//
// Start only API:
//   pm2 start ecosystem.config.js --only inventory-api
//
// Monitor processes:
//   pm2 monit
//
// View logs:
//   pm2 logs inventory-api
//   pm2 logs inventory-api --lines 100
//
// Restart app:
//   pm2 restart inventory-api
//
// Reload app (zero-downtime):
//   pm2 reload inventory-api
//
// Stop app:
//   pm2 stop inventory-api
//
// Delete app:
//   pm2 delete inventory-api
//
// Save process list:
//   pm2 save
//
// Resurrect saved processes:
//   pm2 resurrect
//
// Setup startup script:
//   pm2 startup
//   pm2 save
//
// Deploy with PM2:
//   pm2 deploy production setup
//   pm2 deploy production
//   pm2 deploy production exec "pm2 reload all"
//
// =============================================================================
