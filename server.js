const express = require('express');
const app = express();
const session = require('express-session');
const WebSocket = require('ws');
require('dotenv').config();
const PORT = process.env.PORT || 8000;
const path = require('path');
const fs = require('fs');
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
    const filePath = path.join(__dirname, './users.json');  // Path to your users.json file
    
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
    const uploadSpeed   = netData[0].tx_sec; // bytes/sec

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
const wss = new WebSocket.Server({ server }); // Attach WebSocket to the same server


wss.on('connection', (ws) => {
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
        console.log('WebSocket Client Disconnected');
        clearInterval(logInterval);
    });

    // Send logs immediately after connection
    sendLogs();
});

//module.exports = app;
// Start server
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});