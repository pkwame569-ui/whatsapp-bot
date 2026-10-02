const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys')
const express = require('express')
const QRCode = require('qrcode')
const P = require('pino')

const app = express()
let qrCodeData = null
let isLinked = false

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth')
    const sock = makeWASocket({
        auth: state,
        logger: P({ level: 'silent' }),
        printQRInTerminal: false,
        browser: ['Chrome (Linux)', '', '']
    })

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update
        
        if (qr) {
            qrCodeData = await QRCode.toDataURL(qr)
            console.log("QR TAYARI - Fungua website!")
        }

        if (connection === 'open') {
            isLinked = true
            qrCodeData = null
            console.log("✅ BOT IMEUNGWA 0795804621")
        }

        if (connection === 'close') {
            isLinked = false
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
            if (shouldReconnect) startBot()
        }
    })
}

app.get('/', (req, res) => {
    if (isLinked) {
        return res.send('<h1 style="text-align:center; margin-top:50px">✅ Bot Imeunganishwa! 0795804621</h1>')
    }
    if (qrCodeData) {
        res.send(`
            <div style="text-align:center; font-family:Arial; padding:20px">
                <h2>Scan na 0795804621</h2>
                <img src="${qrCodeData}" style="width:320px; border:5px solid #000">
                <p><b>WhatsApp > ⋮ > Linked devices > Link a device</b></p>
                <p>QR inabadilika baada ya sec 30 - Refresh page</p>
                <script>setTimeout(()=>location.reload(), 25000)</script>
            </div>
        `)
    } else {
        res.send('<h2 style="text-align:center; margin-top:100px">Subiri... QR inatengenezwa<br><br>Refresh baada ya sec 5</h2><script>setTimeout(()=>location.reload(), 5000)</script>')
    }
})

app.listen(10000, () => console.log("Server on 10000"))
startBot()
