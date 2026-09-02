const { exec } = require("child_process");

function runSpeedTest() {
    return new Promise((resolve, reject) => {
        exec("speedtest-cli --json   ", (error, stdout, stderr) => {
            if (error) {
                reject("Error running speed test: " + error.message);
                return;
            }

            try {
                const result = JSON.parse(stdout);
                const resp = {
                    ping: result.ping + " ms",
                    download_speed: (result.download / 1e6).toFixed(2) + " Mbps",
                    upload_speed: (result.upload / 1e6).toFixed(2) + " Mbps"
                };
                resolve(resp);
            } catch (err) {
                reject("Error parsing speed test result: " + err.message);
            }
        });
    });
}

module.exports = {runSpeedTest};
