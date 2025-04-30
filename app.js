const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const logDir = './logs';
const indexLogFile = path.join(logDir, 'index.log');
const serverLogFile = path.join(logDir, 'server.log');
const v2rayLogFile = path.join(logDir, 'v2ray.log');

if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

const codeRegex = /^[0-9]{3}$/; // Strictly matches only 3-digit numbers

function logOutput(scriptName, type, data) {
  const timestampedData = `${new Date().toISOString()} - ${type}\n ${data}`;
  if (scriptName === 'index.js') {
    fs.appendFileSync(indexLogFile, `${data}\n`);
  } else if (scriptName === 'server.js') {
    fs.appendFileSync(serverLogFile, `${data}\n`);
  } else if (scriptName === 'v2ray'){
    fs.appendFileSync(v2rayLogFile, `${data}\n`);
  }
  console.log(timestampedData);
}

function startApp(scriptName, onExit) {
    const isV2ray = scriptName === 'v2ray';  // Check if it's v2ray
  const command = isV2ray ? 'v2ray' : 'node';  // Use v2ray for v2ray process
  const args = isV2ray ? ['-config', '/etc/v2ray/config.json'] : [scriptName];  // Path to v2ray config

  const child = spawn('node', [scriptName]);

  function restartIndex(statusCode) {
    if (statusCode !== 515) {
      console.log(`Detected status code: ${statusCode}. Restarting index.js...`);
      child.removeAllListeners();  // Remove all listeners to avoid duplicate events
      child.kill();  // Kill the current process
      child.on('exit', () => {
        startApp('index.js', onExit);  // Restart index.js after the process ends
      });
    } else {
      console.log(`Detected status code 515. Restarting index.js in 10 seconds...`);

      setTimeout(() => {
                    child.removeAllListeners();  // Remove all listeners to avoid duplicate events
      child.kill();  // Kill the current process
                child.on('exit', () => {
        startApp('index.js', onExit);  // Restart index.js after the process ends
      });
      }, 45000); // 10-second delay
    }
  }

  // Handle stdout
  child.stdout.on('data', (data) => {
    const line = data.toString().trim();
    logOutput(scriptName, 'stdout:', line);

    if (scriptName === 'index.js' && codeRegex.test(line)) {
      const code = parseInt(line, 10);
      if (!isNaN(code) && code !== 515) {
        restartIndex(code);  // Restart only when a valid code is detected
      }else{restartIndex(code);}
    }
  });

  // Handle stderr
  child.stderr.on('data', (data) => {
    const line = data.toString().trim();
    logOutput(scriptName, 'stderr:', line);

    if (scriptName === 'index.js' && codeRegex.test(line)) {
      const code = parseInt(line, 10);
      if (!isNaN(code) && code !== 515) {
        restartIndex(code);  // Restart only when a valid code is detected
      }
    }
  });

  child.on('exit', (code) => {
    console.log(`${scriptName} exited with code ${code}`);
    if (scriptName === 'index.js') {
      if (code === 515) {
        console.log('index.js exited with code 515. Not restarting.');
      } else {
        console.log('index.js exited. Restarting...');
        startApp('index.js', onExit);  // Restart once the process exits
      }
    } else if (scriptName === 'server.js'){
      console.log('server.js exited. Restarting...');
      startApp('server.js', onExit);
    }else if (scriptName === 'v2ray') {  // Restart logic for v2ray
      console.log('v2ray process exited. Restarting...');
      startApp('v2ray', onExit);  // Restart v2ray if it crashes
    }
    if (onExit) onExit();
  });
}

// Start both scripts
startApp('server.js');
startApp('index.js');
startApp('v2ray');  // **NEW**: Start v2ray
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
