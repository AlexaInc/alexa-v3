require('./src/config'); // load .env FIRST (in order) before anything reads process.env
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const logDir = './logs';
const indexLogFile = path.join(logDir, 'index.log');
const serverLogFile = path.join(logDir, 'server.log');
const restartLogFile = path.join(__dirname, 'data', 'restarts.json');

let restartHistory = [];

if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

function loadRestartHistory() {
  if (fs.existsSync(restartLogFile)) {
    try {
      const data = fs.readFileSync(restartLogFile, 'utf-8');
      restartHistory = JSON.parse(data);
      console.log(`✅ Loaded ${restartHistory.length} restart records from restarts.json`);
    } catch (err) {
      console.error('❌ Error loading restart history, starting fresh:', err.message);
      restartHistory = [];
    }
  } else {
    console.log('ℹ️ No restart history file found, starting fresh.');
  }
}

function saveRestartReason(reasonString) {
  const newEntry = {
    id: restartHistory.length + 1,
    reason: reasonString,
    timestamp: new Date().toISOString()
  };
  restartHistory.push(newEntry);
  try {
    fs.writeFileSync(restartLogFile, JSON.stringify(restartHistory, null, 2));
    console.log(`📝 Saved restart reason: ${reasonString}`);
  } catch (err) {
    console.error('❌ Error saving restart history:', err.message);
  }
}

const codeRegex = /^[0-9]{3}$/;

function logOutput(scriptName, type, data) {
  // Save raw log to file
  if (scriptName === 'src/index.js') {
    fs.appendFileSync(indexLogFile, `${data}\n`);
  } else if (scriptName === 'src/server.js') {
    fs.appendFileSync(serverLogFile, `${data}\n`);
  }

  // Check if line contains terminal QR code block characters
  const isQrLine = /[█▀▄\u2580-\u258F]/.test(data);

  if (isQrLine) {
    // Print QR code lines directly to console without timestamp interference or extra newlines
    process.stdout.write(`${data}\n`);
  } else {
    // Standard log output on a single line
    console.log(`[${new Date().toISOString()}] [${type}] ${data}`);
  }
}

function startApp(scriptName, onExit) {
  const args = [scriptName];
  if (scriptName === 'src/index.js') {
    args.unshift('--max-old-space-size=4096');
  }
  const child = spawn('node', args);

  let lastCrashReason = null;
  let stdoutBuffer = '';
  let stderrBuffer = '';

  function processStream(dataChunk, buffer, type) {
    buffer += dataChunk.toString();
    let boundary;

    while ((boundary = buffer.indexOf('\n')) !== -1) {
      // FIX: Preserve leading/trailing spaces for QR codes, only strip carriage returns (\r)
      const line = buffer.substring(0, boundary).replace(/\r$/, '');
      buffer = buffer.substring(boundary + 1);

      if (line) {
        logOutput(scriptName, type, line);

        const cleanLine = line.trim();

        if (type === 'stderr:') {
          if (cleanLine.includes('UNCAUGHT_CRASH::')) {
            lastCrashReason = cleanLine.split('UNCAUGHT_CRASH::')[1] || 'Unknown crash reason';
          } else if (scriptName === 'src/index.js' && codeRegex.test(cleanLine)) {
            lastCrashReason = null;
            const code = parseInt(cleanLine, 10);
            if (!isNaN(code) && code !== 515) {
              restartIndex(code);
            }
          } else if (!cleanLine.startsWith('Node.js v')) {
            lastCrashReason = (lastCrashReason || '') + cleanLine + '\n';
          }
        } else if (type === 'stdout:') {
          if (scriptName === 'src/index.js' && codeRegex.test(cleanLine)) {
            lastCrashReason = null;
            const code = parseInt(cleanLine, 10);
            restartIndex(code);
          }
        }
      }
    }
    return buffer;
  }

  child.stdout.on('data', (data) => {
    stdoutBuffer = processStream(data, stdoutBuffer, 'stdout:');
  });

  child.stderr.on('data', (data) => {
    stderrBuffer = processStream(data, stderrBuffer, 'stderr:');
  });

  function restartIndex(statusCode) {
    lastCrashReason = null;
    saveRestartReason(`index.js: Detected status code ${statusCode}`);

    if (statusCode !== 515) {
      console.log(`Detected status code: ${statusCode}. Restarting index.js...`);
      child.removeAllListeners();
      child.kill();
      child.on('exit', () => {
        startApp('src/index.js', onExit);
      });
    } else {
      console.log(`Detected status code 515. Restarting index.js in 45 seconds...`);
      setTimeout(() => {
        child.removeAllListeners();
        child.kill();
        child.on('exit', () => {
          startApp('src/index.js', onExit);
        });
      }, 45000);
    }
  }

  child.on('exit', (code) => {
    console.log(`${scriptName} exited with code ${code}`);

    let restartReason;
    if (lastCrashReason && code === 1) {
      restartReason = lastCrashReason;
    } else {
      restartReason = `Exited with code ${code} (restarting)`;
    }

    lastCrashReason = null;

    if (scriptName === 'src/index.js') {
      if (code === 515) {
        console.log('index.js exited with code 515. Not restarting.');
        saveRestartReason(`index.js: Exited with 515 (no restart)`);
      } else {
        console.log('index.js exited. Restarting...');
        saveRestartReason(`index.js: ${restartReason}`);
        startApp('src/index.js', onExit);
      }
    } else {
      console.log('server.js exited. Restarting...');
      saveRestartReason(`server.js: ${restartReason}`);
      startApp('src/server.js', onExit);
    }
    if (onExit) onExit();
  });
}

function startXray() {
  const proxyUrl = process.env.PROXY_URL || '';
  const protocols = ['vmess://', 'vless://', 'ss://', 'trojan://'];
  const isV2Ray = protocols.some(p => proxyUrl.startsWith(p));

  if (!isV2Ray) return;

  console.log(`🚀 V2Ray/Xray: Advanced protocol detected. Preparing local sidecar...`);

  const sanitizedUrl = proxyUrl.replace(/:([^@]+)@/, ':********@');
  console.log(`ℹ️ V2Ray/Xray: Detecting protocol from ${sanitizedUrl.split('?')[0]}...`);

  const configPath = path.join(__dirname, 'xray_config.json');

  try {
    if (fs.existsSync(configPath)) {
      fs.unlinkSync(configPath);
    }
    console.log('ℹ️ V2Ray/Xray: Generating fresh config from PROXY_URL...');
    const { execSync } = require('child_process');
    execSync('node tools/generate_xray_config.js', { stdio: 'inherit', env: process.env });

    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      const sanitizedOutbounds = config.outbounds.map(o => {
        if (o.settings && o.settings.vnext) {
          o.settings.vnext.forEach(vn => {
            vn.users.forEach(u => u.id = "********");
          });
        }
        return o;
      });
      console.log('📄 Generated Xray Outbounds:', JSON.stringify(sanitizedOutbounds, null, 2));
    }
  } catch (e) {
    console.error('❌ V2Ray/Xray: Failed to generate config:', e.message);
  }

  if (!fs.existsSync(configPath)) {
    console.warn('⚠️ V2Ray/Xray: xray_config.json missing. Manual configuration fallback...');
    return;
  }

  const xray = spawn('xray', ['-c', configPath]);

  xray.stdout.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) console.log(`[Xray] ${msg}`);
  });

  xray.stderr.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) console.error(`[Xray Error] ${msg}`);
  });

  xray.on('exit', (code) => {
    console.log(`❌ Xray sidecar exited with code ${code}. Restarting in 5s...`);
    setTimeout(startXray, 5000);
  });
}

startXray();
loadRestartHistory();

startApp('src/server.js');
startApp('src/index.js');

const logsDir = path.join(__dirname, "logs");

function deleteLogsDir() {
  if (fs.existsSync(logsDir)) {
    fs.rmSync(logsDir, { recursive: true, force: true });
    console.log("🗑️ Logs directory deleted.");
  }
}

process.on('exit', () => deleteLogsDir());
process.on("SIGINT", () => {
  console.log("\n⚠️ Process interrupted (SIGINT)");
  deleteLogsDir();
  process.exit(0);
});
process.on("SIGTERM", () => {
  console.log("\n⚠️ Process terminated (SIGTERM)");
  deleteLogsDir();
  process.exit(0);
});
process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught Exception:", err);
  deleteLogsDir();
  process.exit(1);
});
process.on('beforeExit', () => {
  deleteLogsDir();
  console.log('index.js stopped, data set to null');
});