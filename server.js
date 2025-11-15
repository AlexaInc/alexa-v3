const express = require('express');
const app = express();
const session = require('express-session');
const WebSocket = require('ws');
require('dotenv').config();
const PORT = process.env.PORT || 8000;
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bodyParser = require('body-parser');
const si = require('systeminformation');
require('./whatsappState'); 
//const { botPhoneNumber, connectionStatus } = require('./index');
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const dataFile = path.join(__dirname, 'sharedData.json');

const cors = require("cors");  
const allowdorigins =["https://hansaka02.github.io","http://alexainc.github.io"]
app.use(cors({ origin: "https://alexainc.github.io" })); 
// Setup session middleware
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false, httpOnly: false, maxAge: 60 * 60 * 1000 }
}));
// Check authentication
function isAuthenticated(req, res, next) {
    if (req.session.isLogged) {
        return next();
    } else if (req.headers.accept && req.headers.accept.includes('application/json')) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        } else {
            return res.redirect('/login'); // Redirect non-API users to the login page
        }
}

function readData() {
  try {
    const data = fs.readFileSync(dataFile, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    return null; // Return null if no data
  }
}

// Reads data every 5 seconds

// Route to check the WhatsApp connection status
// Route to check the WhatsApp connection status
// Route to get WhatsApp connection status
app.get('/status', (req, res) => {
    res.json({ status: readData().status || 'Offline' });
});

app.get('/get-phone-number', (req, res) => {
res.json({ phoneNumber: readData().number });
});




// Login and logout APIs
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
        req.session.isLogged = true;
        req.session.save();
        console.log(`Admin logged in: ${username}`);
        return res.json({ success: true });
    }
    console.log(`Failed login attempt: ${username}`);
    res.status(401).json({ success: false, message: "Invalid credentials" });
});

app.post('/logout', (req, res) => {
    console.log('Admin logged out');
    req.session.destroy(() => res.json({ success: true }));
});



// Route to check if user is logged in
app.get('/is-logged-in', (req, res) => {
    if (req.session.isLogged) {
        res.json({ isLoggedIn: true });
    } else {
        res.json({ isLoggedIn: false });
    }
});

// Serve control panel
app.get('/control', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'control.html'));
});



// Route to download users.json file
app.get('/download-users-json', (req, res) => {
    const filePath = path.join(__dirname, './users.json');  // Path to your users.json file
    
    // Check if the file exists
    if (fs.existsSync(filePath)) {
        res.download(filePath, 'users.json', (err) => {
            if (err) {
                res.status(500).json({ error: 'Failed to download the file' });
            }
        });
    } else {
        res.status(404).json({ error: 'File not found' });
    }



});

app.get('/download-hangman-json', (req, res) => {
    const filePath22 = path.join(__dirname, './hangman.json');
    

    if (fs.existsSync(filePath22)) {
        res.download(filePath22, 'hangman.json', (err) => {
            if (err) {
                res.status(500).json({ error: 'Failed to download the file' });
            }
        });
    } else {
        res.status(404).json({ error: 'File not found' });
    }


});

// Serve login page
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/sysstats', async (req, res) => {
  try {
    const cpuData = await si.currentLoad();
    const memData = await si.mem();
    const netData = await si.networkStats();

    // CPU usage in percentage (0-100)
    const cpuUsage = cpuData.currentLoad;

    // Memory usage in percentage (0-100)
    const memUsage = (memData.used / memData.total) * 100;

    // networkStats() returns an array (one element per network interface).
    // We'll use the first interface (netData[0]) or you can sum them if needed.
    const downloadSpeed = netData[0].rx_sec; // bytes/sec
    const uploadSpeed   = netData[0].tx_sec; // bytes/sec

    res.json({
      cpu: cpuUsage,
      memory: memUsage,
      downloadSpeed,
      uploadSpeed
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve system stats' });
  }
});


const http = require('http')
const server = http.createServer(app); // Create an HTTP server from Express

// --- MODIFICATION START ---
// We will create two WebSocket servers on different paths

// 1. Create the Log server (for your existing dashboard)
const logWss = new WebSocket.Server({ noServer: true });

// 2. Create the Data Transfer server (for your new app)
const dataTransferWss = new WebSocket.Server({ noServer: true });

// This Map will store clients for the data transfer app, indexed by their ID
const clients = new Map();

// Handle the main HTTP 'upgrade' request to route clients based on path
server.on('upgrade', (request, socket, head) => {
  const pathname = request.url;

  if (pathname === '/logs') {
    // Route to your existing log server
    logWss.handleUpgrade(request, socket, head, (ws) => {
      logWss.emit('connection', ws, request);
    });
  } else if (pathname === '/data-transfer') {
    // Route to the new data transfer server
    dataTransferWss.handleUpgrade(request, socket, head, (ws) => {
      dataTransferWss.emit('connection', ws, request);
    });
  } else {
    // No WebSocket server on this path
    console.log('Blocking WebSocket connection to unknown path:', pathname);
    socket.destroy();
  }
});


// --- 1. Your Original Log Functionality (now on /logs) ---
// This code is identical to your original, just attached to logWss
// Your dashboard client must now connect to: ws://your-server-address/logs
logWss.on('connection', (ws) => {
    // Function to send latest logs from both index.js and server.js logs
    const sendLogs = () => {
        const indexLogFilePath = path.join(__dirname, 'logs/index.log');
        const serverLogFilePath = path.join(__dirname, 'logs/server.log');

        // Read index.js logs
        fs.readFile(indexLogFilePath, 'utf8', (err, indexData) => {
            if (err) {
                console.error('Error reading index.js logs:', err);
            } else {
                ws.send(JSON.stringify({ type: 'index', logs: indexData.split('\n').slice(-100) }));
            }
        });

        // Read server.js logs
        fs.readFile(serverLogFilePath, 'utf8', (err, serverData) => {
            if (err) {
                console.error('Error reading server.js logs:', err);
            } else {
                ws.send(JSON.stringify({ type: 'server', logs: serverData.split('\n').slice(-100) }));
            }
        });
    };

    // Send logs every second
    const logInterval = setInterval(sendLogs, 100);

    // Handle WebSocket close
    ws.on('close', () => {
        console.log('Log WebSocket Client Disconnected');
        clearInterval(logInterval);
    });

    // Send logs immediately after connection
    sendLogs();
});

// --- 2. New Data Transfer Functionality (on /data-transfer) ---
// This server handles registration and targeted message passing
// Clients must connect to: ws://your-server-address/data-transfer
dataTransferWss.on('connection', (ws) => {
  console.log('Data transfer client connected.');

  ws.on('message', (message) => {
    let data;
    try {
      // Ensure message is parsed as a string before JSON parsing
      data = JSON.parse(message.toString()); 
    } catch (e) {
      console.error('Failed to parse message or non-JSON message:', message.toString());
      return;
    }

    // 1. Handle Registration
    // Client must send: { "type": "register", "id": "myApp1" }
    if (data.type === 'register' && data.id) {
      if (clients.has(data.id)) {
        // ID is already in use
        ws.send(JSON.stringify({ type: 'error', message: 'ID already taken' }));
        ws.close();
      } else {
        // Store the client with its ID
        ws.id = data.id; // Attach the id to the ws object for easier cleanup
        clients.set(data.id, ws);
        console.log(`Client registered with ID: ${data.id}`);
        ws.send(JSON.stringify({ type: 'status', message: 'Registration successful' }));
      }
    }
    
    // 2. Handle Data Transfer
    // Client sends: { "type": "data", "targetId": "myApp2", "payload": { ... } }
    else if (data.type === 'data' && data.targetId && ws.id) {
      const targetClient = clients.get(data.targetId);

      if (targetClient && targetClient.readyState === WebSocket.OPEN) {
        // Send the payload to the target client
        // We'll also tell the target who it's from
        targetClient.send(JSON.stringify({
          type: 'data',
          from: ws.id, // Let the receiver know who sent it
          payload: data.payload // The actual data
        }));
      } else {
        // Optional: Notify sender that the target is not found or not open
        console.log(`Target client ${data.targetId} not found or not connected.`);
        ws.send(JSON.stringify({ type: 'error', message: `Target ${data.targetId} not available` }));
      }
    }
    
    // 3. Handle unregistered clients trying to send data
    else if (data.type === 'data' && !ws.id) {
        ws.send(JSON.stringify({ type: 'error', message: 'Client not registered. Please register first.' }));
    }
  });

  ws.on('close', () => {
    // If the client was registered, remove it from the map
    if (ws.id) {
      clients.delete(ws.id);
      console.log(`Data transfer client ${ws.id} disconnected.`);
    } else {
      console.log('Unregistered data transfer client disconnected.');
    }
  });
  
  ws.on('error', (error) => {
    console.error(`WebSocket error on client ${ws.id || '(unregistered)'}:`, error);
  });
});
// --- MODIFICATION END ---

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET; // The secret you put in GitHub

// Use bodyParser to get the raw body for signature verification
app.post('/github-webhook', bodyParser.json({
    verify: (req, res, buf) => {
        req.rawBody = buf; // Save the raw body
    }
}), (req, res) => {

    // 1. Get the signature from the GitHub request header
    const githubSignature = req.headers['x-hub-signature-256'];
    
    if (!githubSignature) {
        console.warn('[GitHub Webhook] No signature provided. Request rejected.');
        return res.status(401).send('Signature required');
    }

    // 2. Create our own signature using our secret
    const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET);
    
    // This is the line that was failing (server.js:340)
    // It will now work because req.rawBody is no longer undefined.
    hmac.update(req.rawBody); 
    
    const expectedSignature = `sha256=${hmac.digest('hex')}`;

    // 3. Securely compare the two signatures
    let trusted = false;
    try {
        // Use crypto.timingSafeEqual to prevent timing attacks
        trusted = crypto.timingSafeEqual(
            Buffer.from(githubSignature), 
            Buffer.from(expectedSignature)
        );
    } catch (e) {
        // This catches errors if signatures are different lengths
        console.warn('[GitHub Webhook] Error comparing signatures:', e.message);
    }

    if (!trusted) {
        console.warn('[GitHub Webhook] Invalid signature. Request rejected.');
        return res.status(401).send('Invalid signature');
    }

    // --- If we get here, the Signature is VALID ---
    console.log('[GitHub Webhook] Signature verified. Processing event...');
    
    const event = req.headers['x-github-event'];
    const payload = req.body;

    // Check if it's a 'push' event (which contains commits)
    if (event === 'push') {
        try {
            console.log(`[GitHub] New push to repository: ${payload.repository.name}`);
            console.log(`[GitHub] Pusher: ${payload.pusher.name}`);
            
            // Loop through and log each commit
            payload.commits.forEach(commit => {
                console.log('  --- New Commit ---');
                console.log(`    by: ${commit.author.name} <${commit.author.email}>`);
                console.log(`    message: ${commit.message}`);
                console.log(`    url: ${commit.url}`);
            });
        } catch (e) {
            console.error('[GitHub Webhook] Error processing push payload:', e.message);
        }
    } else {
        console.log(`[GitHub Webhook] Received unhandled event: ${event}`);
    }

    // Send a 200 OK back to GitHub to show we received it successfully
    res.status(200).send('Event received');
});

//module.exports = app;
// Start server
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});