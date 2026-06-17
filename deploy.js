const { NodeSSH } = require('node-ssh');
const path = require('path');
const fs = require('fs');

const ssh = new NodeSSH();

async function deploy() {
  console.log('Starting deployment to 31.97.226.197...');
  
  try {
    await ssh.connect({
      host: '31.97.226.197',
      username: 'root',
      password: 'Jeen@93449193569@2003'
    });
    console.log('SSH Connection successful!');

    const remoteDir = '/www/wwwroot/nbfc-backend';
    
    // Create remote directory
    console.log(`Creating directory ${remoteDir} if not exists...`);
    await ssh.execCommand(`mkdir -p ${remoteDir}`);

    // Upload specific files and folders
    console.log('Uploading files...');
    const localPath = __dirname;
    
    // We only need the compiled code (dist), package files, and prisma schema
    const filesToUpload = [
      { local: 'package.json', remote: 'package.json' },
      { local: 'package-lock.json', remote: 'package-lock.json' }
    ];

    for (const file of filesToUpload) {
      if (fs.existsSync(path.join(localPath, file.local))) {
        await ssh.putFile(path.join(localPath, file.local), path.join(remoteDir, file.remote));
        console.log(`Uploaded ${file.local}`);
      }
    }

    console.log('Uploading dist directory...');
    await ssh.putDirectory(path.join(localPath, 'dist'), path.join(remoteDir, 'dist'), {
      recursive: true,
      concurrency: 10
    });
    console.log('Uploaded dist directory');

    console.log('Uploading prisma directory...');
    await ssh.putDirectory(path.join(localPath, 'prisma'), path.join(remoteDir, 'prisma'), {
      recursive: true,
      concurrency: 10
    });
    console.log('Uploaded prisma directory');

    // Run npm install on remote
    console.log('Running npm install on remote server...');
    const installRes = await ssh.execCommand('npm install --production', { cwd: remoteDir });
    console.log('NPM Install Out:', installRes.stdout);
    if (installRes.stderr) console.error('NPM Install Err:', installRes.stderr);

    // Ensure pm2 is installed
    console.log('Checking pm2 installation...');
    await ssh.execCommand('npm install -g pm2');

    // Restart pm2
    console.log('Starting/Restarting application with pm2...');
    const pm2Res = await ssh.execCommand('pm2 restart nbfc-backend || pm2 start dist/index.js --name nbfc-backend', { cwd: remoteDir });
    console.log('PM2 Out:', pm2Res.stdout);

    console.log('Deployment completed successfully!');
  } catch (err) {
    console.error('Deployment failed:', err);
  } finally {
    ssh.dispose();
  }
}

deploy();
