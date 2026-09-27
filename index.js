const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

client.on('qr', qr => {
    qrcode.generate(qr, {small: true});
    console.log('Scan QR hii!');
});

client.on('ready', () => {
    console.log('Bot iko tayari! ✅');
});

client.on('message', async msg => {
    if (msg.body.toLowerCase() === 'habari') {
        msg.reply('Habari Prince! Mimi ni bot wako 🤖. Niko tayari!');
    } 
    else if (msg.body.toLowerCase().startsWith('ai ')) {
        const prompt = msg.body.slice(3);
        msg.reply(`Umeuliza: ${prompt}\n\nNa-process...`);
    }
});

client.initialize();
