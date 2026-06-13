module.exports = {
  apps: [
    {
      name: "lumi-api",
      script: "./artifacts/api-server/dist/index.mjs",
      instances: "max",
      exec_mode: "cluster",
      watch: false,
      max_memory_restart: "400M",
      error_file: "./logs/pm2-error.log",
      out_file: "./logs/pm2-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      env_production: {
        NODE_ENV: "production",
        PORT: 8080,
      },
      env_development: {
        NODE_ENV: "development",
        PORT: 8080,
      },
    },
  ],
};
