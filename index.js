const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys')
const qrcode = require('qrcode-terminal')

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth')
  const sock = makeWASocket({ auth: state, printQRInTerminal: true })
  sock.ev.on('creds.update', saveCreds)
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update
    if(connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode!== DisconnectReason.loggedOut
      console.log('Disconnected, restarting...')
      if(shouldReconnect) startBot()
    } else if(connection === 'open') {
      console.log('BOT ONLINE!')
    }
  })
  sock.ev.on('messages.upsert', async m => {
    const msg = m.messages[0]
    if(!msg.message) return
    const text = msg.message.conversation || msg.message.extendedTextMessage?.text || ""
    if(text.toLowerCase() === '.ping') {
      await sock.sendMessage(msg.key.remoteJid, { text: 'Pong! Prince Bot iko hai 🏓' })
    }
  })
}
startBot()
