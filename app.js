const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const logDir = './logs';
const indexLogFile = path.join(logDir, 'index.log');
const serverLogFile = path.join(logDir, 'server.log');
const restartLogFile = path.join(__dirname, 'restarts.json'); // <-- New: JSON log file path

let restartHistory = []; // <-- New: To store restart reasons

if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

// --- New Function: Load Restart History ---
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

// --- New Function: Save Restart Reason ---
function saveRestartReason(reasonString) {
  const newEntry = {
    id: restartHistory.length + 1,
    reason: reasonString,
    timestamp: new Date().toISOString()
  };
  restartHistory.push(newEntry);
  try {
    // Write the entire history back to the file
    fs.writeFileSync(restartLogFile, JSON.stringify(restartHistory, null, 2));
    console.log(`📝 Saved restart reason: ${reasonString}`);
  } catch (err) {
    console.error('❌ Error saving restart history:', err.message);
  }
}

const codeRegex = /^[0-9]{3}$/; // Strictly matches only 3-digit numbers

function logOutput(scriptName, type, data) {
  const timestampedData = `${new Date().toISOString()} - ${type}\n ${data}`;
  if (scriptName === 'index.js') {
    fs.appendFileSync(indexLogFile, `${data}\n`);
  } else if (scriptName === 'server.js') {
    fs.appendFileSync(serverLogFile, `${data}\n`);
  }
  console.log(timestampedData);
}

function startApp(scriptName, onExit) {
  const child = spawn('node', [scriptName]);
  
  // This will store any error output
  let lastCrashReason = null; 

  // --- Buffers to store partial lines ---
  let stdoutBuffer = '';
  let stderrBuffer = '';

  // This function processes the stream, finds complete lines, and logs them
  function processStream(dataChunk, buffer, type) {
    buffer += dataChunk.toString(); // Add new data to our leftover buffer
    let boundary;

    while ((boundary = buffer.indexOf('\n')) !== -1) {
      const line = buffer.substring(0, boundary).trim(); 
      buffer = buffer.substring(boundary + 1);      

      if (line) {
        // Log all output to its respective file
        logOutput(scriptName, type, line); 

        // --- Start of Error/Code Checking ---
        if (type === 'stderr:') {
          if (line.includes('UNCAUGHT_CRASH::')) {
            // Case 1: High-priority runtime crash
            lastCrashReason = line.split('UNCAUGHT_CRASH::')[1] || 'Unknown crash reason';
          } else if (scriptName === 'index.js' && codeRegex.test(line)) {
            // Case 2: 3-digit code restart (like 428)
            // This is not a crash, so clear any pending crash reason
            lastCrashReason = null; 
            const code = parseInt(line, 10);
            if (!isNaN(code) && code !== 515) {
              restartIndex(code);
            }
          } else if (!line.startsWith('Node.js v')) {
            // Case 3: Generic stderr (like a module-load crash)
            // Append it to build the full stack trace
            lastCrashReason = (lastCrashReason || '') + line + '\n';
          }
        } else if (type === 'stdout:') {
          // Case 4: 3-digit code restart from stdout
          if (scriptName === 'index.js' && codeRegex.test(line)) {
            // This is not a crash, so clear any pending crash reason
            lastCrashReason = null; 
            const code = parseInt(line, 10);
            if (!isNaN(code) && code !== 515) {
              restartIndex(code);
            } else {
              restartIndex(code);
            }
          }
        }
        // --- End of Error/Code Checking ---
      }
    }
    return buffer; // Return leftover part for the next chunk
  }

  child.stdout.on('data', (data) => {
    stdoutBuffer = processStream(data, stdoutBuffer, 'stdout:');
  });

  child.stderr.on('data', (data) => {
    stderrBuffer = processStream(data, stderrBuffer, 'stderr:');
  });

  // --- MODIFIED: restartIndex must clear the crash reason ---
  function restartIndex(statusCode) {
    // This is a controlled restart, not a crash.
    // Clear any error we might have collected.
    lastCrashReason = null; 
    
    saveRestartReason(`index.js: Detected status code ${statusCode}`);

    if (statusCode !== 515) {
      console.log(`Detected status code: ${statusCode}. Restarting index.js...`);
      child.removeAllListeners(); 
      child.kill(); 
      child.on('exit', () => {
        startApp('index.js', onExit); 
      });
    } else {
      console.log(`Detected status code 515. Restarting index.js in 45 seconds...`);
      setTimeout(() => {
        child.removeAllListeners(); 
        child.kill(); 
        child.on('exit', () => {
          startApp('index.js', onExit); 
        });
      }, 45000); 
    }
  }

  // --- MODIFIED: exit handler now uses the crash reason ---
  child.on('exit', (code) => {
    console.log(`${scriptName} exited with code ${code}`);

    let restartReason;
    // Check if the exit was a crash (code 1) AND we collected a reason
    if (lastCrashReason && code === 1) {
      restartReason = lastCrashReason;
    } else {
      // Default message for other exits (e.g., code 0)
      restartReason = `Exited with code ${code} (restarting)`;
    }
    
    // Clear the reason after using it
    lastCrashReason = null; 

    if (scriptName === 'index.js') {
      if (code === 515) {
        console.log('index.js exited with code 515. Not restarting.');
        saveRestartReason(`index.js: Exited with 515 (no restart)`);
      } else {
        console.log('index.js exited. Restarting...');
        // Save the detailed reason (e.g., the full stack trace)
        saveRestartReason(`index.js: ${restartReason}`);
        startApp('index.js', onExit);
      }
    } else {
      console.log('server.js exited. Restarting...');
      saveRestartReason(`server.js: ${restartReason}`);
      startApp('server.js', onExit);
    }
    if (onExit) onExit();
  });
}

// --- Load history at the very start ---
loadRestartHistory();

// Start both scripts
startApp('server.js');
startApp('index.js');

const logsDir = path.join(__dirname, "logs");

// Your existing cleanup function. This is fine because it targets `logsDir`
// and we placed `restarts.json` in `__dirname` (the root).
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