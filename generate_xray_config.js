const fs = require('fs');
const path = require('path');
const { URL } = require('url');

/**
 * Utility to generate xray_config.json from PROXY_URL (VMess/VLESS/SS/Trojan).
 * This is a simplified generator for common configurations.
 */
/**
 * Utility to generate xray_config.json from PROXY_URL (VMess/VLESS/SS/Trojan).
 */
function generateConfig() {
    const rawProxyUrl = process.env.PROXY_URL || '';
    if (!rawProxyUrl) {
        console.error('❌ No PROXY_URL provided.');
        return;
    }

    // Sanitize URL (remove fragments/comments)
    const proxyUrl = rawProxyUrl.split('#')[0].trim();
    let outbounds = [];

    if (proxyUrl.startsWith('vless://')) {
        try {
            // Robust Regex for VLESS: vless://uuid@host:port?params
            const vlessMatch = proxyUrl.match(/^vless:\/\/([^@]+)@([^:]+):(\d+)(.*)$/i);
            if (!vlessMatch) throw new Error('Invalid VLESS format');

            const [_, uuid, hostname, port, query] = vlessMatch;
            const searchParams = new URLSearchParams(query);
            const params = Object.fromEntries(searchParams.entries());

            console.log(`ℹ️ Parsing VLESS for sidecar: ${hostname}:${port} (network=${params.type || 'tcp'})`);

            outbounds.push({
                protocol: "vless",
                tag: "outbound-main",
                settings: {
                    vnext: [{
                        address: hostname,
                        port: parseInt(port),
                        users: [{
                            id: uuid,
                            encryption: "none",
                            flow: params.flow || ""
                        }]
                    }]
                },
                streamSettings: {
                    network: params.type || "tcp",
                    security: params.security || "none",
                    tlsSettings: (params.security === "tls" || params.security === "reality") ? {
                        allowInsecure: true,
                        serverName: params.sni || hostname,
                        publicKey: params.pbk || "",
                        fingerprint: params.fp || "chrome",
                        shortId: params.sid || "",
                        spiderX: params.spx || ""
                    } : undefined,
                    wsSettings: params.type === "ws" ? {
                        path: params.path || "/",
                        host: params.host || hostname,
                        headers: {
                            Host: params.host || hostname // ALWAYS provide a Host header
                        }
                    } : undefined,
                    sockopt: {
                        mark: 0,
                        tcpFastOpen: true,
                        tcpKeepAliveInterval: 5
                    }
                },
                mux: {
                    enabled: false,
                    concurrency: -1
                }
            });
        } catch (e) {
            console.error('❌ Failed to parse VLESS URL:', e.message);
        }
    }
    else if (proxyUrl.startsWith('vmess://')) {
        try {
            const raw = proxyUrl.replace('vmess://', '');
            const data = JSON.parse(Buffer.from(raw, 'base64').toString());
            console.log(`ℹ️ Parsing VMess: ${data.ps || data.add}`);

            outbounds.push({
                protocol: "vmess",
                tag: "outbound-main",
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
                    wsSettings: data.net === "ws" ? { path: data.path, host: data.host || data.add, headers: { Host: data.host || data.add } } : undefined,
                    sockopt: { tcpKeepAliveInterval: 5 }
                },
                mux: { enabled: false, concurrency: -1 }
            });
        } catch (e) {
            console.error('❌ Failed to parse VMess URL:', e.message);
        }
    }
    else {
        console.error('❌ Unsupported or unknown proxy protocol. Sidecar might not start correctly.');
    }

    if (outbounds.length === 0) return;

    // --- CRITICAL: Disable Mux for sensitive WhatsApp streams & Increase Timeout ---
    outbounds.forEach(o => {
        o.mux = { enabled: false };
    });

    const fullConfig = {
        log: { loglevel: "info" },
        dns: {
            servers: [
                "https+local://1.1.1.1/dns-query",
                "https+local://8.8.8.8/dns-query"
            ],
            queryStrategy: "UseIP"
        },
        inbounds: [
            {
                port: 10808,
                protocol: "socks",
                settings: { auth: "noauth", udp: true, ip: "127.0.0.1" },
                sniffing: { enabled: true, destOverride: ["http", "tls"], metadataOnly: true }
            },
            {
                port: 10809,
                protocol: "http",
                settings: { auth: "noauth", ip: "127.0.0.1" },
                sniffing: { enabled: true, destOverride: ["http", "tls"], metadataOnly: true }
            }
        ],
        outbounds: outbounds,
        policy: {
            levels: {
                "0": {
                    "handshake": 120, // Increased to 2 minutes for slow HF handshakes
                    "connIdle": 300,
                    "uplinkOnly": 1,
                    "downlinkOnly": 1,
                    "bufferSize": 10240
                }
            }
        },
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

    const configPath = path.join(__dirname, 'xray_config.json');
    fs.writeFileSync(configPath, JSON.stringify(fullConfig, null, 2));
    console.log(`✅ xray_config.json generated at ${configPath}`);
}

generateConfig();
