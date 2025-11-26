const { default: makeWASocket, useSingleFileAuthState } = require('@hansaka02/baileys');
const { Boom } = require('@hapi/boom');

const groupJid = "120363407628540320@g.us"; // Replace with your group JID

async function main() {
    try {
        // If you already have a socket, use it instead of creating a new one
        const sock = AlexaInc; // your existing WhiskeySocket instance

        // Fetch group metadata
        const metadata = await sock.groupMetadata(groupJid);

        console.log("Group Metadata:");
        console.log("Subject:", metadata.subject);
        console.log("Owner:", metadata.owner);
        console.log("Creation:", new Date(metadata.creation * 1000).toLocaleString());
        console.log("Participants:");
        metadata.participants.forEach(p => {
            console.log(`- ${p.id} (${p.admin || "member"})`);
        });

    } catch (err) {
        console.error("Error fetching group metadata:", err);
    }
}

main();
