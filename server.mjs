import http from 'http';
import net from 'net';
import { execSync } from 'child_process';
import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { homedir, platform } from 'os';

const __dir = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 7331;

function daemonDir() {
  switch (platform()) {
    case 'darwin': return join(homedir(), 'Library', 'Caches', 'ms-playwright', 'daemon');
    case 'win32':  return join(process.env.LOCALAPPDATA || homedir(), 'ms-playwright', 'daemon');
    default:       return join(homedir(), '.cache', 'ms-playwright', 'daemon');
  }
}

function findLatestSession() {
  const dir = daemonDir();
  let latest = null;
  let latestTime = 0;
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return null;
  }
  for (const hash of entries) {
    const sessionFile = join(dir, hash, 'default.session');
    try {
      const config = JSON.parse(readFileSync(sessionFile, 'utf8'));
      if (config.timestamp > latestTime) {
        latestTime = config.timestamp;
        latest = config;
      }
    } catch {}
  }
  return latest;
}

function sendToSocket(socketPath, message) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(socketPath);
    let buffer = '';

    socket.on('connect', () => {
      socket.write(JSON.stringify(message) + '\n');
    });

    socket.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.id === message.id) {
            socket.destroy();
            if (msg.error) reject(new Error(msg.error));
            else resolve(msg.result);
          }
        } catch {}
      }
      buffer = lines[lines.length - 1];
    });

    socket.on('error', reject);
    socket.on('close', () => reject(new Error('Socket closed without response')));
  });
}

console.log('Starting Playwright session via MCP Bridge extension...');
console.log('Click the Playwright MCP Bridge extension icon in Chrome to connect.\n');
execSync('playwright-cli open --extension', { stdio: 'pipe' });

const sessionConfig = findLatestSession();
if (!sessionConfig) {
  console.error('\nNo active session found.');
  console.error('Make sure you have run: playwright-cli open --extension');
  console.error('and clicked the Playwright MCP Bridge extension icon in Chrome.\n');
  process.exit(1);
}
console.log(`Session ready.\n`);

let msgId = 1;

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(readFileSync(join(__dir, 'index.html')));
    return;
  }

  if (req.method === 'POST' && req.url === '/run') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      const { code } = JSON.parse(body);
      try {
        const result = await sendToSocket(sessionConfig.socketPath, {
          id: msgId++,
          method: 'run',
          params: { args: { _: ['run-code', code] }, cwd: sessionConfig.workspaceDir || process.cwd() },
          version: sessionConfig.version,
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        const text = typeof result === 'string' ? result : (result?.text ?? JSON.stringify(result));
        const resultMatch = text.match(/### Result\n([\s\S]*?)(?:\n###|$)/);
        const errorMatch = text.match(/### Error\n([\s\S]*?)(?:\n###|$)/);

        if (resultMatch) {
          res.end(JSON.stringify({ ok: true, output: resultMatch[1].trim() }));
        } else if (errorMatch || result?.isError) {
          res.end(JSON.stringify({ ok: false, output: (errorMatch?.[1] ?? text).trim() }));
        } else {
          res.end(JSON.stringify({ ok: true, output: text.trim() }));
        }
      } catch (e) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, output: e.message }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, () => {
  console.log(`Playwright Playground ready at http://localhost:${PORT}\n`);
  const url = `http://localhost:${PORT}`;
  const cmd = platform() === 'win32' ? `start ${url}` : platform() === 'darwin' ? `open ${url}` : `xdg-open ${url}`;
  execSync(cmd);
});
