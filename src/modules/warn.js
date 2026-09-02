const { response } = require('express');
const fs = require('fs');
const path = require('path');


const databaseDir = path.join(process.cwd(), 'data');
const warningsPath = path.join(databaseDir, 'warnings.json');

// Initialize warnings file if it doesn't exist
function initializeWarningsFile() {
    // Create database directory if it doesn't exist
    if (!fs.existsSync(databaseDir)) {
        fs.mkdirSync(databaseDir, { recursive: true });
    }
    
    // Create warnings.json if it doesn't exist
    if (!fs.existsSync(warningsPath)) {
        fs.writeFileSync(warningsPath, JSON.stringify({}), 'utf8');
    }
}

async function warnUser(AlexaInc, chatId, senderId, mentionedJids, message) {
    try {

        initializeWarningsFile();

        // if (!chatId.endsWith('@g.us')) {
        //     await AlexaInc.sendMessage(chatId, { 
        //         text: 'This command can only be used in groups!'
        //     });
        //     return;
        // }




        let userToWarn;
        

        if (mentionedJids && mentionedJids.length > 0) {
            userToWarn = mentionedJids[0];
        }
   
        else if (message.message?.extendedTextMessage?.contextInfo?.participant) {
            userToWarn = message.message.extendedTextMessage.contextInfo.participant;
        }
        
        if (!userToWarn) {
            await AlexaInc.sendMessage(chatId, { 
                text: 'Please mention the user or reply to their message to warn baby!'
            });
            return;
        }

        await new Promise(resolve => setTimeout(resolve, 1000));

        try {
            let warnings = {};
            try {
                warnings = JSON.parse(fs.readFileSync(warningsPath, 'utf8'));
            } catch (error) {
                warnings = {};
            }


            if (!warnings[chatId]) warnings[chatId] = {};
            if (!warnings[chatId][userToWarn]) warnings[chatId][userToWarn] = 0;
            
            warnings[chatId][userToWarn]++;
            fs.writeFileSync(warningsPath, JSON.stringify(warnings, null, 2));

            const warningMessage = `*『 WARNING ALERT 』*\n\n` +
                `👤 *Warned User:* @${userToWarn.split('@')[0]}\n` +
                `⚠️ *Warning Count:* ${warnings[chatId][userToWarn]}/3\n` +
                `👑 *Warned By:* @${senderId.split('@')[0]}\n\n` +
                `📅 *Date:* ${new Date().toLocaleString()}`;
const interactiveButtons = [
  {
    name: "quick_reply",
    buttonParamsJson: JSON.stringify({
                    display_text: 'Remove warn',
                    id: `.rmw_fbc ${userToWarn}`})
  }];
//   console.log(interactiveButtons)
            await AlexaInc.sendMessage(chatId, { 
                text: warningMessage,
                mentions: [userToWarn, senderId],
                  footer: "Powered by HANSAKA",
  interactiveButtons
            })
            if (warnings[chatId][userToWarn] >= 3) {
                await new Promise(resolve => setTimeout(resolve, 1000));

                await AlexaInc.groupParticipantsUpdate(chatId, [userToWarn], "remove");
                delete warnings[chatId][userToWarn];
                fs.writeFileSync(warningsPath, JSON.stringify(warnings, null, 2));
                
                const kickMessage = `*『 AUTO-KICK 』*\n\n` +
                    `@${userToWarn.split('@')[0]} has been removed from the group after receiving 3 warnings! ⚠️`;

                await AlexaInc.sendMessage(chatId, { 
                    text: kickMessage,
                    mentions: [userToWarn]
                });
            }
        } catch (error) {
            console.error('Error in warn command:', error);
            await AlexaInc.sendMessage(chatId, { 
                text: '❌ Failed to warn user!'
            });
        }
    } catch (error) {
        console.error('Error in warn command:', error);
        if (error.data === 429) {
            await new Promise(resolve => setTimeout(resolve, 2000));
            try {
                await AlexaInc.sendMessage(chatId, { 
                    text: '❌ Rate limit reached. Please try again in a few seconds.'
                });
            } catch (retryError) {
                console.error('Error sending retry message:', retryError);
            }
        } else {
            try {
                await AlexaInc.sendMessage(chatId, { 
                    text: '❌ Failed to warn user. Make sure the bot is admin and has sufficient permissions.'
                });
            } catch (sendError) {
                console.error('Error sending error message:', sendError);
            }
        }
    }
}




function loadWarnings() {
    if (!fs.existsSync(warningsPath)) {
        fs.writeFileSync(warningsPath, JSON.stringify({}), 'utf8');
    }
    const data = fs.readFileSync(warningsPath, 'utf8');
    return JSON.parse(data);
}

async function checkWarns(AlexaInc, chatId, mentionedJidList) {
try{
        const warnings = loadWarnings();

    if (mentionedJidList.length === 0) {
        await AlexaInc.sendMessage(chatId, { text: 'Please mention a user to check warnings.' });
        return;
    }

    const userToCheck = mentionedJidList[0];
    const warningCount = warnings[chatId]?.[userToCheck] || 0;
// console.log(userToCheck,warnings)
    await AlexaInc.sendMessage(chatId, { text: `User has ${warningCount} warning(s).` });
}catch(error){
    await AlexaInc.sendMessage(chatId, { text: error.message });
}
}

async function removeWarn(AlexaInc,chatId,mentionedJidList) {
        const userJid = mentionedJidList[0];
    try{
        const database = loadWarnings();
        if (database[chatId]?.[userJid] !== undefined) {
    

    delete database[chatId][userJid];
    await AlexaInc.sendMessage(chatId, { text: `✅ Success: Users warnings removed.` });
                  fs.writeFileSync(warningsPath, JSON.stringify(database, null, 2));
} else {

    await AlexaInc.sendMessage(chatId, { text: `User has no warnings.` });

}
    }catch(error){
            await AlexaInc.sendMessage(chatId, { text: `fail to remove warn ${error.message}` });
    }
}


module.exports = {warnUser,checkWarns,removeWarn};