const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason
} = require('@whiskeysockets/baileys');

const express = require('express');
const QRCode = require('qrcode');
const P = require('pino');
const { GoogleGenAI } = require('@google/genai');

// =====================================
// MBILAO PROJECT CONSULTANT WORLDWIDE
// =====================================

const app = express();
const PORT = process.env.PORT || 10000;

let sock = null;
let qrCodeData = null;
let isLinked = false;
let starting = false;
let reconnectTimer = null;

const processedMessages = new Set();

// =====================================
// GEMINI CONFIGURATION
// =====================================

const ai = process.env.GEMINI_API_KEY
    ? new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY
    })
    : null;

// =====================================
// BUSINESS INFORMATION
// =====================================

const BUSINESS_INFO = `
You are the AI customer service assistant for
MBILAO PROJECT CONSULTANT WORLDWIDE.

Our services include:
1. Project proposal writing.
2. Grant writing and grant application support.
3. Business plan preparation.
4. Feasibility studies.
5. Monitoring and evaluation.
6. Data collection and documentation.
7. Project budgeting and financial narratives.
8. Strategic planning.
9. Logframes and theory of change.
10. Project planning and management.
11. AI chatbots and business automation.

Our clients include NGOs, CBOs, entrepreneurs,
project founders and private businesses.

RULES:
- Reply in the same language as the customer.
- Use natural Kiswahili for Kiswahili messages.
- Use professional English for English messages.
- Understand the question before answering.
- Explain services clearly and briefly.
- Ask follow-up questions when necessary.
- For project proposals, ask about the project,
  location, beneficiaries, activities and budget.
- Never invent service prices.
- Never guarantee that a customer will receive a grant.
- Do not invent funding opportunities or client details.
- Be polite, professional and helpful.
- Keep WhatsApp replies reasonably short.
- If you do not know something, say so honestly.
`;

// =====================================
// ASK GEMINI
// =====================================

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
        throw new Error(
            'Gemini haijarejesha jibu la maandishi.'
        );
    }

    return answer.trim();
}

// =====================================
// WHATSAPP BOT
// =====================================

async function startBot() {
    if (starting) return;

    starting = true;

    try {
        if (!process.env.GEMINI_API_KEY) {
            console.error(
                'WARNING: GEMINI_API_KEY haijawekwa.'
            );
        }

        const {
            state,
            saveCreds
        } = await useMultiFileAuthState('auth');

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

        // ---------------------------------
        // CONNECTION STATUS
        // ---------------------------------

        sock.ev.on('connection.update', async (update) => {
            const {
                connection,
                lastDisconnect,
                qr
            } = update;

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

            if (connection === 'open') {
                isLinked = true;
                qrCodeData = null;
                starting = false;

                console.log(
                    'WHATSAPP CONNECTED SUCCESSFULLY'
                );
            }

            if (connection === 'close') {
                isLinked = false;
                starting = false;
                sock = null;

                const statusCode =
                    lastDisconnect?.error?.output?.statusCode;

                console.log(
                    'WhatsApp connection closed:',
                    statusCode || 'unknown'
                );

                if (
                    statusCode === DisconnectReason.loggedOut
                ) {
                    qrCodeData = null;

                    console.error(
                        'WhatsApp imelogout. Utahitaji kuunganisha tena.'
                    );

                    return;
                }

                scheduleReconnect();
            }
        });

        // ---------------------------------
        // RECEIVE AND REPLY TO MESSAGES
        // ---------------------------------

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
                        if (jid.endsWith('@g.us')) continue;
                        if (jid === 'status@broadcast') continue;

                        const messageId = msg.key.id;

                        if (!messageId) continue;

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

                        console.log(
                            'REPLY SENT SUCCESSFULLY'
                        );

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

        scheduleReconnect();
    }
}

// =====================================
// RECONNECT
// =====================================

function scheduleReconnect() {
    if (reconnectTimer) return;

    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        startBot();
    }, 5000);
}

// =====================================
// WEBSITE AND QR CODE
// =====================================

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
            <body style="font-family:Arial;text-align:center;padding:25px">
                <h2>MBILAO PROJECT CONSULTANT WORLDWIDE</h2>
                <h3 style="color:green">
                    WhatsApp Connected Successfully
                </h3>
                <p>Bot imeunganishwa na WhatsApp.</p>
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
                <title>WhatsApp QR</title>
            </head>
            <body style="font-family:Arial;text-align:center;padding:20px">
                <h2>MBILAO AI BOT</h2>
                <p>Scan QR code kwa kutumia WhatsApp.</p>
                <img src="${qrCodeData}"
                     alt="WhatsApp QR Code"
                     style="width:280px;max-width:90%">
                <p>WhatsApp → Linked Devices → Link a Device</p>
                <p>Ukurasa utajirejesha baada ya sekunde 10.</p>
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
        <body style="font-family:Arial;text-align:center;padding:25px">
            <h2>MBILAO PROJECT CONSULTANT WORLDWIDE</h2>
            <p>Bot inaanza. Subiri QR code...</p>
            <script>
                setTimeout(() => location.reload(), 5000);
            </script>
        </body>
        </html>
    `);
});

// =====================================
// HEALTH CHECK
// =====================================

app.get('/health', (req, res) => {
    res.json({
        status: 'running',
        whatsappConnected: isLinked,
        qrReady: Boolean(qrCodeData),
        geminiConfigured: Boolean(process.env.GEMINI_API_KEY)
    });
});

// =====================================
// START SERVER
// =====================================

app.listen(PORT, '0.0.0.0', () => {
    console.log(
        `MBILAO BOT SERVER RUNNING ON PORT ${PORT}`
    );

    startBot();
});
