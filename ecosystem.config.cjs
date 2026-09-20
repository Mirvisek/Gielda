const PORT = process.env.PORT || 3005;

module.exports = {
  apps: [
    {
      name: "gielda-web",
      script: "node_modules/next/dist/bin/next",
      args: `start -p ${PORT}`,
      instances: "max",
      exec_mode: "cluster",
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "gielda-market-worker",
      script: "server/workers/market-worker.ts",
      interpreter: "node_modules/.bin/tsx",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "gielda-news-worker",
      script: "server/workers/news-worker.ts",
      interpreter: "node_modules/.bin/tsx",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "gielda-prediction-worker",
      script: "server/workers/prediction-worker.ts",
      interpreter: "node_modules/.bin/tsx",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "gielda-alerts-worker",
      script: "server/workers/alerts-worker.ts",
      interpreter: "node_modules/.bin/tsx",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
