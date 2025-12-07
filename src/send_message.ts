export async function sendMessage(sock: any, phoneNumber: string | string[], message: any) {
    try {
        const jid = phoneNumber.includes('@') ? phoneNumber : `${phoneNumber}@s.whatsapp.net`;

        console.log(`\n📤 Отправка сообщения на ${phoneNumber}...`);

        const [result] = await sock.onWhatsApp(phoneNumber);

        if (!result || !result.exists) {
            console.error(`Номер ${phoneNumber} не зарегистрирован в WhatsApp`);
            return {
                success: false,
                error: 'Номер не зарегистрирован в WhatsApp'
            };
        }

        const sentMessage = await sock.sendMessage(jid, { text: message });

        console.log(`Сообщение успешно отправлено!`);
        console.log(`Кому: ${phoneNumber}`);
        console.log(`Текст: "${message}"\n`);

        return {
            success: true,
            messageId: sentMessage.key.id,
            timestamp: sentMessage.messageTimestamp
        };

    } catch (err) {
        console.error(`Ошибка при отправке сообщения:`, err);
        return {
            success: false,
            error: err
        };
    }
}
