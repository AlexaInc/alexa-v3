const { HttpsProxyAgent } = require('https-proxy-agent');
const axios = require('axios');
require('dotenv').config();

const proxyUrl = process.env.PROXY_URL || 'http://31.59.20.176:6754'; // Fallback to log's IP if env is empty
console.log(`🧪 Testing Proxy: ${proxyUrl}`);

async function test() {
    try {
        const agent = new HttpsProxyAgent(proxyUrl, {
            rejectUnauthorized: false,
            timeout: 15000
        });

        console.log('📡 Attempting to fetch https://www.google.com via proxy...');
        const start = Date.now();
        const res = await axios.get('https://www.google.com', {
            httpAgent: agent,
            httpsAgent: agent,
            timeout: 15000,
            validateStatus: () => true
        });

        console.log(`✅ Success! Status: ${res.status} (${Date.now() - start}ms)`);
    } catch (err) {
        console.error('❌ Proxy Test FAILED:');
        console.error(`Message: ${err.message}`);
        if (err.code) console.error(`Code: ${err.code}`);
        if (err.stack) {
            const lines = err.stack.split('\n');
            console.error(`Stack: ${lines[0]}\n${lines[1]}`);
        }
    }
}

test();
