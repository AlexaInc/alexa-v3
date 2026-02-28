const fs = require('fs');
const path = require('path');
const { URL } = require('url');

/**
 * Utility to generate xray_config.json from PROXY_URL (VMess/VLESS/SS/Trojan).
 * This is a simplified generator for common configurations.
 */
function generateConfig() {
    const proxyUrl = process.env.PROXY_URL || '';
    if (!proxyUrl) {
        console.error('❌ No PROXY_URL provided.');
        return;
    }

    let outbounds = [];

    if (proxyUrl.startsWith('vmess://')) {
        try {
            const raw = proxyUrl.replace('vmess://', '');
            const data = JSON.parse(Buffer.from(raw, 'base64').toString());
            console.log(`ℹ️ Parsing VMess: ${data.ps || data.add}`);

            outbounds.push({
                protocol: "vmess",
                settings: {
                    vnext: [{
                        address: data.add,
                        port: parseInt(data.port),
                        users: [{
                            id: data.id,
                            alterId: parseInt(data.aid || 0),
                            security: "auto"
                        }]
                    }]
                },
                streamSettings: {
                    network: data.net || "tcp",
                    security: data.tls === "tls" ? "tls" : "none",
                    tlsSettings: data.tls === "tls" ? { allowInsecure: true } : undefined,
                    wsSettings: data.net === "ws" ? { path: data.path, headers: { Host: data.host } } : undefined
                }
            });
        } catch (e) {
            console.error('❌ Failed to parse VMess URL:', e.message);
        }
    }
    else if (proxyUrl.startsWith('vless://')) {
        try {
            const url = new URL(proxyUrl);
            const uuid = url.username;
            const params = Object.fromEntries(url.searchParams.entries());
            console.log(`ℹ️ Parsing VLESS: ${url.hostname}`);

            outbounds.push({
                protocol: "vless",
                settings: {
                    vnext: [{
                        address: url.hostname,
                        port: parseInt(url.port) || 443,
                        users: [{
                            id: uuid,
                            encryption: "none"
                        }]
                    }]
                },
                streamSettings: {
                    network: params.type || "tcp",
                    security: params.security || "none",
                    tlsSettings: params.security === "tls" ? { allowInsecure: true } : undefined,
                    wsSettings: params.type === "ws" ? {
                        path: params.path || "/",
                        headers: params.host ? { Host: params.host } : undefined
                    } : undefined
                }
            });
        } catch (e) {
            console.error('❌ Failed to parse VLESS URL:', e.message);
        }
    }
    else {
        console.error('❌ Unsupported or non-V2Ray protocol.');
        return;
    }

    if (outbounds.length === 0) return;

    const fullConfig = {
        log: { loglevel: "info" },
        dns: {
            servers: ["1.1.1.1", "8.8.8.8", "https+local://1.1.1.1/dns-query"],
            queryStrategy: "UseIP"
        },
        inbounds: [{
            port: 10808,
            protocol: "socks",
            settings: {
                auth: "noauth",
                udp: true,
                ip: "127.0.0.1"
            },
            sniffing: {
                enabled: true,
                destOverride: ["http", "tls", "quic"],
                metadataOnly: false
            }
        }],
        outbounds: outbounds,
        routing: {
            domainStrategy: "AsIs",
            rules: [
                {
                    type: "field",
                    outboundTag: "outbound-main",
                    network: "tcp,udp"
                }
            ]
        }
    };

    // Ensure outbounds have a tag for routing
    if (fullConfig.outbounds.length > 0) {
        fullConfig.outbounds[0].tag = "outbound-main";
    }

    const configPath = path.join(__dirname, 'xray_config.json');
    fs.writeFileSync(configPath, JSON.stringify(fullConfig, null, 2));
    console.log(`✅ xray_config.json generated at ${configPath}`);
}

generateConfig();
