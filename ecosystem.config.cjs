const path = require('node:path');

const serverDir = path.join(__dirname, 'server');

module.exports = {
  apps: [
    {
      name: 'smxform',
      script: path.join(serverDir, 'src/index.js'),
      cwd: serverDir,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
    },
  ],
};
