const express = require('express');
const app = express();
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth');
  const sock = makeWASocket({ auth: state, printQRInTerminal: true });
  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    if(qr) qrcode.generate(qr, {small: true});
    if(connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode!== DisconnectReason.loggedOut;
      if(shouldReconnect) startBot();
    } else if(connection === 'open') {
      console.log('BOT ONLINE!');
    }
  });
  sock.ev.on('messages.upsert', async m => {
    const msg = m.messages[0];
    if(!msg.message) return;
    const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
    if(text.toLowerCase() === 'hi') {
      await sock.sendMessage(msg.key.remoteJid, { text: 'Hello! Bot iko Online ✅' });
    }
  });
}
startBot();
app.get('/', (req, res) => res.send('Bot is Running!'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server on ${PORT}`));
