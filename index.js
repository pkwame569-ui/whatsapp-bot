const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason
} = require('@whiskeysockets/baileys');

const express = require('express');
const QRCode = require('qrcode');
const P = require('pino');
const { GoogleGenAI } = require('@google/genai');

// ================================
// MBILAO PROJECT CONSULTANT WORLDWIDE
// ================================

const app = express();
const PORT = process.env.PORT || 10000;

let sock = null;
let qrCodeData = null;
let isLinked = false;
let starting = false;
let reconnectTimer = null;

const processedMessages = new Set();

// Gemini API
const ai = process.env.GEMINI_API_KEY
    ? new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY
    })
    : null;

// Maelekezo ya biashara
const BUSINESS_INFO = `
You are the professional AI customer service assistant
for MBILAO PROJECT CONSULTANT WORLDWIDE.

BUSINESS SERVICES:
- Project proposal writing.
- Grant writing and grant application support.
- Business plan preparation.
- Feasibility studies.
- Monitoring and evaluation.
- Data collection and documentation.
- Project budgeting and financial narratives.
- Strategic planning.
- Logframes and theory of change.
- Project planning and management.
- AI chatbots and business automation.

TARGET CLIENTS:
NGOs, CBOs, entrepreneurs, community organizations,
project founders and private businesses.

YOUR RESPONSIBILITIES:
1. Understand the customer's question before answering.
2. Answer naturally and professionally.
3. Reply in the same language as the customer.
4. Use Kiswahili when the customer writes in Kiswahili.
5. Use English when the customer writes in English.
6. Explain services clearly and briefly.
7. Ask follow-up questions when necessary.
8. If someone needs a proposal, ask about the project,
   location, beneficiaries, activities and budget.
9. Never invent prices, client information or funding calls.
10. Never guarantee that a customer will receive a grant.
11. If you do not know something, say so honestly.
12. Keep WhatsApp replies concise and easy to understand.
13. Direct serious customers toward discussing their
    project requirements with MBILAO PROJECT CONSULTANT
    WORLDWIDE.

You are an AI assistant, not a human employee.
`;

// ================================
// GEMINI AI RESPONSE
// ================================

async function askAI(message) {
    if (!ai) {
        throw new Error(
            'GEMINI_API_KEY haijawekwa kwenye Render Environment.'
        );
    }

    const interaction = await ai.interactions.create({
        model: 'gemini-3.8-flash',
        input: message,
        system_instruction: BUSINESS_INFO,
        generation_config: {
            max_output_tokens: 350,
            thinking_level: 'low'
        }
    });

    const answer = interaction.output_text;

    if (!answer || !answer.trim()) {
        throw new Error('Gemini haijarejesha jibu la maandishi.');
    }

    return answer.trim();
}

// ================================
// WHATSAPP BOT
// ================================

async function startBot() {
    if (starting) return;

    starting = true;

    try {
        const auth = await useMultiFileAuthState('auth');

        const state = auth.state;
        const saveCreds = auth.saveCreds;

        sock = makeWASocket({
            auth: state,
            logger: P({ level: 'silent' }),
            printQRInTerminal: false,
            browser: [
                'MBILAO PROJECT CONSULTANT WORLDWIDE',
                'Chrome',
                '1.0'
            ]
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            // QR code ya kuunganisha WhatsApp
            if (qr) {
                try {
                    qrCodeData = await QRCode.toDataURL(qr);
                    isLinked = false;

                    console.log(
                        'QR TAYARI - Fungua website kuscan.'
                    );
                } catch (error) {
                    console.error(
                        'QR ERROR:',
                        error.message
                    );
                }
            }

            // WhatsApp imeunganishwa
            if (connection === 'open') {
                isLinked = true;
                qrCodeData = null;
                starting = false;

                console.log(
                    'WHATSAPP CONNECTED SUCCESSFULLY'
                );
            }

            // Muunganisho umekatika
            if (connection === 'close') {
                isLinked = false;
                starting = false;

                const statusCode =
                    lastDisconnect?.error?.output?.statusCode;

                console.log(
                    'WhatsApp connection closed:',
                    statusCode || 'unknown'
                );

                if (statusCode === DisconnectReason.loggedOut) {
                    qrCodeData = null;

                    console.log(
                        'WhatsApp imelogout. Itahitaji kuunganishwa tena.'
                    );

                    return;
                }

                // Jaribu kuunganisha tena
                if (!reconnectTimer) {
                    reconnectTimer = setTimeout(() => {
                        reconnectTimer = null;
                        startBot();
                    }, 5000);
                }
            }
        });

        // ================================
        // POKEA UJUMBE
        // ================================

        sock.ev.on(
            'messages.upsert',
            async ({ messages, type }) => {
                if (type !== 'notify') return;

                for (const msg of messages) {
                    try {
                        if (!msg.message) continue;

                        if (msg.key.fromMe) continue;

                        const jid = msg.key.remoteJid;

                        if (!jid) continue;

                        // Puuza group messages
                        if (jid.endsWith('@g.us')) continue;

                        // Puuza status
                        if (jid === 'status@broadcast') continue;

                        const messageId = msg.key.id;

                        if (!messageId) continue;

                        // Zuia kujibu ujumbe uleule mara mbili
                        if (processedMessages.has(messageId)) {
                            continue;
                        }

                        processedMessages.add(messageId);

                        if (processedMessages.size > 1000) {
                            const oldest =
                                processedMessages.values().next().value;

                            processedMessages.delete(oldest);
                        }

                        const content = msg.message;

                        const incomingText =
                            content.conversation ||
                            content.extendedTextMessage?.text ||
                            content.imageMessage?.caption ||
                            content.videoMessage?.caption ||
                            content.documentMessage?.caption ||
                            content.buttonsResponseMessage?.selectedDisplayText ||
                            content.listResponseMessage?.title ||
                            '';

                        const userMessage = incomingText.trim();

                        // Kwa sasa jibu ujumbe wa maandishi pekee
                        if (!userMessage) continue;

                        console.log(
                            'MESSAGE RECEIVED:',
                            userMessage.substring(0, 100)
                        );

                        let reply;

                        try {
                            reply = await askAI(userMessage);
                        } catch (error) {
                            console.error(
                                'GEMINI ERROR:',
                                error.message || error
                            );

                            reply =
                                'Samahani, kwa sasa ninapata changamoto ' +
                                'kujibu ujumbe wako. Tafadhali jaribu tena ' +
                                'baadaye. Asante kwa kuwasiliana na ' +
                                'MBILAO PROJECT CONSULTANT WORLDWIDE.';
                        }

                        await sock.sendMessage(
                            jid,
                            { text: reply },
                            { quoted: msg }
                        );

                        console.log('REPLY SENT SUCCESSFULLY');

                    } catch (error) {
                        console.error(
                            'MESSAGE PROCESSING ERROR:',
                            error.message || error
                        );
                    }
                }
            }
        );

    } catch (error) {
        starting = false;

        console.error(
            'BOT START ERROR:',
            error.message || error
        );

        if (!reconnectTimer) {
            reconnectTimer = setTimeout(() => {
                reconnectTimer = null;
                startBot();
            }, 10000);
        }
    }
}

// ================================
// WEBSITE YA BOT NA QR CODE
// ================================

app.get('/', (req, res) => {
    if (isLinked) {
        return res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta name="viewport"
                      content="width=device-width, initial-scale=1">
                <title>MBILAO AI BOT</title>
            </head>
            <body style="font-family:Arial;text-align:center;padding:30px">
                <h1>MBILAO PROJECT CONSULTANT WORLDWIDE</h1>
                <h2 style="color:green">
                    WhatsApp Connected Successfully ✅
                </h2>
                <p>Bot iko tayari kupokea ujumbe.</p>
            </body>
            </html>
        `);
    }

    if (qrCodeData) {
        return res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta name="viewport"
                      content="width=device-width, initial-scale=1">
                <title>Unganisha WhatsApp</title>
            </head>
            <body style="font-family:Arial;text-align:center;padding:20px">
                <h2>MBILAO AI BOT</h2>
                <p>Scan QR code hii kwa WhatsApp yako.</p>
                <img src="${qrCodeData}"
                     alt="WhatsApp QR Code"
                     style="width:280px;max-width:90%">
                <p>Fungua WhatsApp → Linked Devices → Link a Device.</p>
                <p>Ukurasa huu utajirejesha baada ya sekunde 10.</p>
                <script>
                    setTimeout(() => location.reload(), 10000);
                </script>
            </body>
            </html>
        `);
    }

    return res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta name="viewport"
                  content="width=device-width, initial-scale=1">
            <title>MBILAO AI BOT</title>
        </head>
        <body style="font-family:Arial;text-align:center;padding:30px">
            <h2>MBILAO PROJECT CONSULTANT WORLDWIDE</h2>
            <p>Bot inaanza au inasubiri QR code...</p>
            <p>Ukurasa huu utajirejesha baada ya sekunde 5.</p>
            <script>
                setTimeout(() => location.reload(), 5000);
            </script>
        </body>
        </html>
    `);
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'running',
        whatsappConnected: isLinked,
        qrReady: Boolean(qrCodeData),
        geminiConfigured: Boolean(process.env.GEMINI_API_KEY)
    });
});

// ================================
// ANZISHA SERVER
// ================================

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);

    if (!process.env.GEMINI_API_KEY) {
        console.error(
            'WARNING: GEMINI_API_KEY haijawekwa kwenye Render.'
        );
    }

    startBot();
});
