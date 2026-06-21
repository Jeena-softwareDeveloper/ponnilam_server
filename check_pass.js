const bcrypt = require('bcryptjs');

async function main() {
  const isMatch = await bcrypt.compare('pon', '$2b$10$LggSlKbp82P8mJGzJe9mue/ThtiaElpmO.IUef8nxTp3Gq8BqNZae');
  console.log('Matches pon:', isMatch);
}

main();
