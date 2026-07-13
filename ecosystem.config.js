module.exports = {
  apps: [{
    name: 'cynexvm',
    cwd: './backend',
    script: 'dist/index.js',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
    },
    error_file: '/var/log/cynexvm/error.log',
    out_file: '/var/log/cynexvm/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    max_restarts: 10,
    restart_delay: 5000,
    min_uptime: 10000,
    max_memory_restart: '1G',
    kill_timeout: 10000,
    listen_timeout: 15000,
    shutdown_with_message: true,
  }]
};
