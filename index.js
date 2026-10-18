const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const express = require('express');
const QRCode = require('qrcode');
const P = require('pino');
const OpenAI = require('openai');

const app = express();
const PORT = process.env.PORT || 10000;

const openai = new OpenAI({
apiKey: process.env.OPENAI_API_KEY
});

let qrCodeData = null;
let isLinked = false;
let sock = null;
const recentMessages = new Set();

const BUSINESS_INFO = `
Jina la biashara: MBILAO PROJECT CONSULTANT WORLDWIDE.

Huduma:

1. Project Proposal Writing.
2. Grant Writing and Funding Application Support.
3. Business Plan Preparation.
4. Feasibility Studies.
5. Monitoring and Evaluation (M&E).
6. Data Collection and Documentation.
7. Project Budgeting and Financial Narratives.
8. Strategic Plans, Logframes and Theory of Change.
9. Project Planning and Management.
10. AI Chatbot and Business Automation.

Wateja tunaowahudumia ni NGOs, CBOs, founders, entrepreneurs,
small businesses na mashirika ya maendeleo.

Jibu kwa lugha ambayo mteja ametumia, iwe Kiswahili au Kiingereza.
Kuwa mtaalamu, mkarimu, mfupi na mwenye kueleweka.
Uliza maswali mafupi ili kuelewa mahitaji ya mteja.
Usibuni bei, ahadi za kupata grant, wafadhili, au taarifa ambazo hujui.
Bei ikiulizwa, eleza kuwa itategemea ukubwa na mahitaji ya kazi.
Usidai kuwa grant imehakikishwa.
Usidai kuwa wewe ni binadamu; wewe ni AI assistant wa biashara.
`;

async function askAI(message) {
const response = await openai.responses.create({
model: 'gpt-4.1-mini',
instructions: BUSINESS_INFO,
input: message,
max_output_tokens: 350
});

return response.output_text ||
    'Samahani, sijaweza kuandaa jibu kwa sasa. Tafadhali jaribu tena.';

}

async function startBot() {
const { state, saveCreds } = await useMultiFileAuthState('auth');

sock = makeWASocket({
    auth: state,
    logger: P({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ['MBILAO PROJECT CONSULTANT WORLDWIDE', 'Chrome', '1.0']
});

sock.ev.on('creds.update', saveCreds);

sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
        qrCodeData = await QRCode.toDataURL(qr);
        console.log('QR TAYARI - Fungua website kuiscan.');
    }

    if (connection === 'open') {
        isLinked = true;
        qrCodeData = null;
        console.log('WhatsApp imeunganishwa!');
    }

    if (connection === 'close') {
        isLinked = false;
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        if (statusCode !== DisconnectReason.loggedOut) {
            setTimeout(() => startBot().catch(console.error), 3000);
        } else {
            console.log('WhatsApp imetoka. Unganisha tena.');
        }
    }
});

sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
        try {
            if (!msg.message || msg.key.fromMe) continue;

            const jid = msg.key.remoteJid;
            if (!jid || jid === 'status@broadcast' || jid.endsWith('@g.us')) continue;

            if (recentMessages.has(msg.key.id)) continue;
            recentMessages.add(msg.key.id);

            if (recentMessages.size > 500) {
                const first = recentMessages.values().next().value;
                recentMessages.delete(first);
            }

            const content = msg.message;
            const text =
                content.conversation ||
                content.extendedTextMessage?.text ||
                content.imageMessage?.caption ||
                content.videoMessage?.caption;

            if (!text || !text.trim()) continue;

            console.log('Ujumbe umepokelewa:', text);

            await sock.sendPresenceUpdate('composing', jid);

            let reply;
            try {
                reply = await askAI(text.trim());
            } catch (err) {
                console.error('OpenAI error:', err.message);
                reply = 'Samahani, nina tatizo la kujibu kwa sasa. Tafadhali jaribu tena baada ya muda mfupi.';
            }

            await sock.sendMessage(jid, { text: reply });
            await sock.sendPresenceUpdate('paused', jid);

            console.log('Jibu limetumwa.');
        } catch (err) {
            console.error('Ujumbe error:', err.message);
        }
    }
});

}

app.get('/', (req, res) => {
if (isLinked) {
return res.send('<h1 style="text-align:center">✅ MBILAO PROJECT CONSULTANT WORLDWIDE — Bot Imeunganishwa</h1>');
}

if (qrCodeData) {
    return res.send(`
        <div style="text-align:center;font-family:Arial;padding:20px">
            <h2>Unganisha WhatsApp yako</h2>
            <img src="${qrCodeData}" style="width:300px;max-width:90%">
            <p>WhatsApp → Linked devices → Link a device</p>
            <p>QR ikikataa, refresh ukurasa kupata QR mpya.</p>
            <script>setTimeout(()=>location.reload(),25000)</script>
        </div>
    `);
}

res.send('<h2 style="text-align:center">Bot inaanza. Refresh baada ya sekunde 5.</h2><script>setTimeout(()=>location.reload(),5000)</script>');

});

app.get('/health', (req, res) => {
res.json({ status: 'running', whatsappConnected: isLinked });
});

app.listen(PORT, '0.0.0.0', () => {
console.log("Server inaendesha kwenye port ${PORT}");
});

startBot().catch(err => console.error('Bot startup error:', err));
