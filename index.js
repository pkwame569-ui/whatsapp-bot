const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys')
const qrcode = require('qrcode-terminal')
const express = require('express')
const app = express()
const P = require('pino')

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info')

  const sock = makeWASocket({
    auth: state,
    logger: P({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ['Chrome (Linux)', '', '']
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update

    // PAIRING CODE SYSTEM - kwa simu 1 tuu
    if (qr &&!sock.authState.creds.registered) {
      const phoneNumber = process.env.PHONE_NUMBER
      if (phoneNumber) {
        try {
          await new Promise(r => setTimeout(r, 3000))
          const code = await sock.requestPairingCode(phoneNumber.replace(/[^0-9]/g, ''))
          console.log('\n===================================')
          console.log(` PAIRING CODE: ${code}`)
          console.log(` Namba: ${phoneNumber}`)
          console.log(` WhatsApp > Linked devices > Link with phone number`)
          console.log('===================================\n')
        } catch (e) {
          console.log('Error getting code:', e.message)
        }
      } else {
        console.log('QR Code (kama hauna PHONE_NUMBER):')
        qrcode.generate(qr, { small: true })
      }
    }

    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode!== DisconnectReason.loggedOut
      if (shouldReconnect) {
        console.log('Reconnecting...')
        startBot()
      } else {
        console.log('Logged out')
      }
    } else if (connection === 'open') {
      console.log('✅ BOT ONLINE! Imeunganishwa!')
    }
  })

  sock.ev.on('messages.upsert', async (m) => {
    const msg = m.messages[0]
    if (!msg.message) return
    const text = msg.message.conversation || msg.message.extendedTextMessage?.text || ''

    if (text.toLowerCase() === 'hi' || text.toLowerCase() === 'hello') {
      await sock.sendMessage(msg.key.remoteJid, { text: 'Hello! Bot iko online ✅' })
    }
  })
}

startBot()

app.get('/', (req, res) => res.send('Bot is running ✅'))
const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`Server running on ${PORT}`))
