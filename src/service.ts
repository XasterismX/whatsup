import makeWASocket, {
    DisconnectReason,
    useMultiFileAuthState,
    Browsers,
    delay
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import P from 'pino';
import Fastify from 'fastify'
import qrcode from 'qrcode-terminal';
import * as dotenv from 'dotenv';
import * as path from "node:path";
import {sendMessage} from "./send_message";
import bodyParser from "body-parser";
dotenv.config({
    path: path.resolve(__dirname, "../", '.env'),
});

const logger = P({ level: 'warn' });


const auth_folder = process.env.AUTH_FOLDER || "./auth"

async function startWhatsAppBot() {
    const { state, saveCreds } = await useMultiFileAuthState(auth_folder);

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false, // Используем кастомный вывод QR
        logger,
        browser: Browsers.ubuntu('WhatsApp Bot'),
        // Настройки для стабильного соединения
        connectTimeoutMs: 60_000,
        defaultQueryTimeoutMs: 0,
        keepAliveIntervalMs: 10_000,
        emitOwnEvents: true,
        markOnlineOnConnect: true,
    });



    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('\n📱 Отсканируйте QR-код с помощью WhatsApp:\n');
            qrcode.generate(qr, { small: true });
            console.log('\n⏳ Ожидание сканирования QR-кода...\n');
        }

        if (connection === 'open') {
            console.log('✅ Успешно подключено к WhatsApp!');
            console.log('📞 Номер:', sock.user?.id.split(':')[0]);
            console.log('📝 Сессия сохранена в:', auth_folder);


        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;

            console.log('❌ Соединение закрыто. Причина:', lastDisconnect?.error);

            if (shouldReconnect) {
                console.log('🔄 Переподключение...');
                await delay(3000);
                startWhatsAppBot();
            } else {
                console.log('🚪 Вышли из системы. Удалите папку auth_info для повторной авторизации.');
            }
        }
    });


    sock.ev.on('creds.update', saveCreds);


    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

        for (const message of messages) {
            // Игнорируем собственные сообщения
            if (message.key.fromMe) continue;

            const messageText = message.message?.conversation ||
                message.message?.extendedTextMessage?.text || '';

            const from = message.key.remoteJid;
            const senderName = message.pushName || 'Unknown';

            console.log(`\n📨 Получено сообщение от ${senderName} (${from}):`);
            console.log(`   "${messageText}"\n`);


        }
    });

    return sock;
}




const app_port = Number(process.env.APP_PRT) || 8080;

startWhatsAppBot().then((sock) =>{

    const fastify = Fastify({ logger: true })

    /**
     * @type {import('fastify').RouteShorthandOptions}
     * @const
     */
    const opts = {
        schema: {
            body: {
                type: 'object',
                properties: {
                    number: { type: 'string' },
                    text: { type: 'string' }
                }
            }
        }
    }
    fastify.post<
        { Body: {
            number: string
            text: string
        }}
    >('/send',opts,  async (request, rep) => {
        const {number, text} = request.body;

    const {success, error}  = await sendMessage(sock, number, text);
    if (success) {
        rep.status(200).send('OK')

    }else {
        rep.send(error).status(500);
    }
    })
    fastify.listen({
        port: app_port
    })
})
    .catch((err: any) => {
    console.error('Критическая ошибка:', err);
    process.exit(1);
});

// Обработка graceful shutdown
process.on('SIGINT', () => {
    console.log('\nЗавершение работы бота...');
    process.exit(0);
});