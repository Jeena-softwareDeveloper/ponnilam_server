module.exports = {
  apps: [
    {
      name: 'nbfc-api',
      script: 'dist/index.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 5000,
      },
      error_file: './logs/nbfc-api-error.log',
      out_file: './logs/nbfc-api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      restart_delay: 4000,
    },
  ],
};
