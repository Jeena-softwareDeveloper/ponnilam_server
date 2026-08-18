import * as ftp from 'basic-ftp';
import * as path from 'path';
import * as fs from 'fs';
import * as dns from 'dns';
import { promisify } from 'util';

const dnsLookup = promisify(dns.lookup);

function getFtpConfig() {
  const host = process.env.FTP_HOST;
  const user = process.env.FTP_USER;
  const password = process.env.FTP_PASSWORD;
  const port = parseInt(process.env.FTP_PORT || '21');

  if (!host || !user || !password) {
    throw new Error('[FTP] Missing required env vars: FTP_HOST, FTP_USER, FTP_PASSWORD');
  }

  return { host, user, password, port, secure: false as const };
}

function getRemoteBase() {
  return process.env.FTP_REMOTE_BASE || '/uploads/activities';
}

/** Resolve domain to IPv4 to avoid IPv6/EPSV PASV issues */
async function resolveIPv4(host: string): Promise<string> {
  const { address } = await dnsLookup(host, { family: 4 });
  return address;
}

/**
 * Upload a single file to the FTP server.
 */
export async function uploadFileToFtp(localFilePath: string, remoteSubPath: string): Promise<void> {
  if (!fs.existsSync(localFilePath)) {
    throw new Error(`Local file not found: ${localFilePath}`);
  }

  const config = getFtpConfig();
  const remoteBase = getRemoteBase();
  const ipv4 = await resolveIPv4(config.host);

  const client = new ftp.Client();
  client.ftp.verbose = process.env.NODE_ENV === 'development';

  try {
    await client.access({ ...config, host: ipv4 });
    await client.ensureDir(remoteBase);
    const remotePath = `${remoteBase}/${path.basename(remoteSubPath)}`;
    await client.uploadFrom(localFilePath, remotePath);
    console.log(`[FTP] Uploaded: ${path.basename(localFilePath)} → ${remotePath}`);
  } finally {
    client.close();
  }
}

/**
 * Sync all files from local uploads/activities folder to FTP server.
 */
export async function syncAllActivitiesToFtp(): Promise<{ uploaded: string[]; errors: string[] }> {
  const localDir = path.join(process.cwd(), 'public', 'uploads', 'activities');
  if (!fs.existsSync(localDir)) {
    console.log('[FTP Sync] No local activities folder found.');
    return { uploaded: [], errors: [] };
  }

  const config = getFtpConfig();
  const remoteBase = getRemoteBase();
  const ipv4 = await resolveIPv4(config.host);

  const files = fs.readdirSync(localDir).filter((f) => !f.startsWith('.'));
  const uploaded: string[] = [];
  const errors: string[] = [];

  const client = new ftp.Client();
  client.ftp.verbose = process.env.NODE_ENV === 'development';

  try {
    await client.access({ ...config, host: ipv4 });
    await client.ensureDir(remoteBase);

    for (const file of files) {
      const localPath = path.join(localDir, file);
      const remotePath = `${remoteBase}/${file}`;
      try {
        await client.uploadFrom(localPath, remotePath);
        uploaded.push(file);
        console.log(`[FTP Sync] ✓ ${file}`);
      } catch (err: any) {
        errors.push(file);
        console.error(`[FTP Sync] ✗ ${file}: ${err.message}`);
      }
    }
  } finally {
    client.close();
  }

  return { uploaded, errors };
}
