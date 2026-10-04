// Boots the API + built web app against a fresh, throwaway data directory.
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', '.data', 'e2e');
fs.rmSync(dataDir, { recursive: true, force: true });
process.env.DATA_DIR = dataDir;

if (!fs.existsSync(path.join(__dirname, '..', 'web', 'dist', 'index.html'))) {
  console.error('web/dist is missing: run `npm run build` before the e2e suite.');
  process.exit(1);
}
require('../server/index.js').main();
