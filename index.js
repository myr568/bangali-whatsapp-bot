const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const { google } = require('googleapis');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
app.use(bodyParser.json());

// --- ENVIRONMENT CONFIGURATIONS ---
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN; 
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID || "1023413104198806"; 
const SPREADSHEET_ID = process.env.SPREADSHEET_ID || '16kuhcidjptgfxqaB1y0ujeEb59zrewVkUw7o6bVWynw';

// Gemini 2.5 Flash Engine Configuration
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const aiModel = genAI.getGenerativeModel({ 
    model: "gemini-2.5-flash", 
    systemInstruction: `
        You are the official AI assistant for the Bangali Foundation on WhatsApp.
        Website: https://bangalifoundation.org/
        
        CRITICAL FOUNDATION RULES:
        1. Always represent https://bangalifoundation.org/ as our official site.
        2. Our mission is to provide aid, education, and support to underprivileged communities.
        3. Treasurer: Md. Romjan.
        4. For technical issues, contact Mohammad Yasin (mohammadyasin568@gmail.com).
        
        TONE: Polite, professional, and concise. Do not use generic filler words.
        LANGUAGE: Always reply naturally in the user's preferred language.
    `
});







// --- SECURE GOOGLE AUTH INITIALIZATION ---
let authClient;

try {
    const base64Key = process.env.GOOGLE_PRIVATE_KEY_BASE64;

    if (!base64Key) {
        throw new Error("GOOGLE_PRIVATE_KEY_BASE64 environment variable is completely missing.");
    }

    // 1. Decode base64 string completely back to raw string text
    let decodedKey = Buffer.from(base64Key.trim(), 'base64').toString('utf8').trim();

    // 2. Safely clean up hidden line break literal texts (\n) inside memory
    const cleanPrivateKey = decodedKey
        .replace(/\\n/g, '\n')
        .replace(/\n/g, '\n')
        .trim();

    // 3. Initialize JWT with clean parameters
    authClient = new google.auth.JWT({
        email: process.env.GOOGLE_CLIENT_EMAIL,
        key: cleanPrivateKey,
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });

    console.log("🔒 Google Sheets Auth initialized successfully via Base64 Memory Decoder.");
} catch (error) {
    console.error("❌ CRITICAL: Failed to initialize Google Auth layer:", error.message);
}







// --- RELIABLE SHEETS DATABASE HANDLERS ---
async function getUserLanguage(userId) {
    try {
        const gsapi = google.sheets({ version: 'v4', auth: authClient });
        const response = await gsapi.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: 'UserPrefs!A:B' });
        const rows = response.data.values;
        if (rows) {
            const userRow = rows.reverse().find(row => row[0] === userId);
            return userRow ? userRow[1] : null;
        }
    } catch (e) { console.error("Error reading language preference:", e.message); return null; }
}

async function logLanguage(userId, lang) {
    try {
        const gsapi = google.sheets({ version: 'v4', auth: authClient });
        await gsapi.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID, 
            range: 'UserPrefs!A:B',
            valueInputOption: 'USER_ENTERED', 
            resource: { values: [[userId, lang]] }
        });
        console.log(`✅ Logged Language preference for user: ${userId}`);
    } catch (e) { console.error("Error logging language preference:", e.message); }
}

async function checkUserUnlocked(userId) {
    try {
        const gsapi = google.sheets({ version: 'v4', auth: authClient });
        const response = await gsapi.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: 'UnlockedUsers!A:A' });
        const rows = response.data.values;
        return rows ? rows.some(row => row[0] === userId) : false;
    } catch (e) { console.error("Error checking unlocked profile status:", e.message); return false; }
}

async function logUnlockedUser(userId) {
    try {
        const gsapi = google.sheets({ version: 'v4', auth: authClient });
        await gsapi.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID, 
            range: 'UnlockedUsers!A:A',
            valueInputOption: 'USER_ENTERED', 
            resource: { values: [[userId]] }
        });
        console.log(`✅ Logged Unlocked Profile tracking entry for: ${userId}`);
    } catch (e) { console.error("Error logging unlocked user entry:", e.message); }
}






// --- WHATSAPP WIRE TRANSMISSION ENGINE ---
async function sendToWhatsApp(to, dataPayload) {
    try {
        const url = `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`;
        await axios.post(url, {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: to,
            ...dataPayload
        }, { headers: { Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}` } });
    } catch (e) { 
        if (e.response) console.error("❌ Transmission Error:", JSON.stringify(e.response.data, null, 2));
    }
}






// --- DYNAMIC INTERACTIVE MENUS ---
async function sendLanguageSelector(to) {
    await sendToWhatsApp(to, {
        type: "interactive",
        interactive: {
            type: "list",
            body: { text: "Welcome to Bangali Foundation. Please choose your language to continue / কথোপকথন শুরু করতে নিচে থেকে ভাষা নির্বাচন করুন:" },
            action: {
                button: "Select",
                sections: [{
                    title: "Languages Available",
                    rows: [
                        { id: "LANG_EN", title: "English 🇬🇧" },
                        { id: "LANG_BN", title: "বাংলা 🇧🇩" },
                        { id: "LANG_TR", title: "Türkçe 🇹🇷" },
                        { id: "LANG_AR", title: "العربية 🇸اعه" }
                    ]
                }]
            }
        }
    });
}

const menuTranslations = {
    'EN': { body: "Select a menu link below to explore our services:", btn: "View Options", title: "Foundation Links" },
    'BN': { body: "সামনে অগ্রসর হতে নিচের মেনু থেকে একটি লিঙ্ক বেছে নিন:", btn: "মেনু দেখুন", title: "প্রধান লিঙ্কসমূহ" },
    'TR': { body: "Devam etmek için lütfen aşağıdaki menüden bir bağlantı seçin:", btn: "Seçenekleri Gör", title: "Resmi Bağlantılar" },
    'AR': { body: "يرجى تحديد رابط من القائمة أدناه للمتابعة:", btn: "عرض القائمة", title: "روابط المؤسسة" }
};

const labelTranslations = {
    'EN': { donate: "Donate 💰", volunteer: "Be a Volunteer 🤝", aid: "Need Help/Aid? 🙋‍♂️", partner: "Be a Partner 🏢", projects: "Our Projects 📂" },
    'BN': { donate: "দান করুন 💰", volunteer: "স্বেচ্ছাসেবক হোন 🤝", aid: "সাহায্য প্রয়োজন? 🙋‍♂️", partner: "পার্টনার হোন 🏢", projects: "আমাদের প্রকল্পসমূহ 📂" },
    'TR': { donate: "Bağış Yap 💰", volunteer: "Gönüllü Ol 🤝", aid: "Yardım Lazım Mı? 🙋‍♂️", partner: "Ortak Ol 🏢", projects: "Projelerimiz 📂" },
    'AR': { donate: "تبرع الآن 💰", volunteer: "كن متطوعاً 🤝", aid: "هل تحتاج مساعدة؟ 🙋‍♂️", partner: "كن شريكاً 🏢", projects: "مشاريعنا 📂" }
};

async function sendVerticalActionMenu(to, lang) {
    const p = menuTranslations[lang || 'EN'];
    const l = labelTranslations[lang || 'EN'];
    await sendToWhatsApp(to, {
        type: "interactive",
        interactive: {
            type: "list",
            body: { text: p.body },
            action: {
                button: p.btn,
                sections: [{
                    title: p.title,
                    rows: [
                        { id: "CLICK_DONATE", title: l.donate },
                        { id: "CLICK_VOLUNTEER", title: l.volunteer },
                        { id: "CLICK_AID", title: l.aid },
                        { id: "CLICK_PARTNER", title: l.partner },
                        { id: "CLICK_PROJECTS", title: l.projects }
                    ]
                }]
            }
        }
    });
}





// --- GEMINI RESPONSE COMPILER ---
async function getSmartReply(userMessage, userId, lang) {
    try {
        const gsapi = google.sheets({ version: 'v4', auth: authClient });

        // Fast FAQ Sheet Lookup Interception
        const faqRes = await gsapi.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: 'FAQ!A2:B500' });
        const rows = faqRes.data.values;
        if (rows) {
            const match = rows.find(row => userMessage.toLowerCase().includes(row[0].toLowerCase()));
            if (match) return match[1];
        }

        // Processing General Knowledge via Gemini AI
        const result = await aiModel.generateContent(`User Language Preference Context: ${lang}. Message received: ${userMessage}`);
        const response = await result.response;
        const aiText = response.text();

        // Write Tracking Metrics Row
        try {
            const bangladeshTime = new Date().toLocaleString("en-US", { timeZone: "Asia/Dhaka" });
            await gsapi.spreadsheets.values.append({
                spreadsheetId: SPREADSHEET_ID, range: 'BotUsageLog!A:C',
                valueInputOption: 'USER_ENTERED',
                resource: { values: [[bangladeshTime, userId, "WhatsApp Gemini AI Engine"]] }
            });
        } catch (e) { console.error("Logging sync error", e.message); }

        return aiText;
    } catch (error) { return "System latency detected. Please try again shortly or contact mohammadyasin568@gmail.com"; }
}






// --- CORE GATEWAY ROUTERS ---
app.get('/webhook', (req, res) => {
    const verifyToken = 'bangali_foundation_2026';
    if (req.query['hub.verify_token'] === verifyToken) return res.send(req.query['hub.challenge']);
    res.status(403).send('Verification failed');
});

app.post('/webhook', async (req, res) => {
    const body = req.body;
    res.status(200).send('EVENT_RECEIVED');

    if (!body.entry || !body.entry[0].changes || !body.entry[0].changes[0].value.messages) return;

    const messageEvent = body.entry[0].changes[0].value.messages[0];
    const waId = messageEvent.from;

    // A. Interactivity Choice Event Processing
    if (messageEvent.type === 'interactive' && messageEvent.interactive.list_reply) {
        const payload = messageEvent.interactive.list_reply.id;

        if (payload.startsWith('LANG_')) {
            const map = { 'LANG_EN': 'EN', 'LANG_BN': 'BN', 'LANG_TR': 'TR', 'LANG_AR': 'AR' };
            const chosenLang = map[payload] || 'EN';
            await logLanguage(waId, chosenLang);
            await sendVerticalActionMenu(waId, chosenLang);
        } 
        else if (payload.startsWith('CLICK_')) {
            const lang = await getUserLanguage(waId) || 'EN';
            const links = {
                'CLICK_DONATE': {
                    'EN': "Direct Donation Link: https://bangalifoundation.org/support-us/",
                    'BN': "সরাসরি দান করার লিঙ্ক: https://bangalifoundation.org/support-us/",
                    'TR': "Bağış Bağlantısı: https://bangalifoundation.org/support-us/",
                    'AR': "رابط التبرع المباشر: https://bangalifoundation.org/support-us/"
                },
                'CLICK_VOLUNTEER': {
                    'EN': "Volunteer Form: https://bangalifoundation.org/become-a-volunteer/",
                    'BN': "স্বেচ্ছাসেবক আবেদন ফর্ম: https://bangalifoundation.org/become-a-volunteer/",
                    'TR': "Gönüllülük Formu: https://bangalifoundation.org/become-a-volunteer/",
                    'AR': "نموذج التطوع: https://bangalifoundation.org/become-a-volunteer/"
                },
                'CLICK_AID': {
                    'EN': "Beneficiary Application: https://bangalifoundation.org/become-a-beneficiary/",
                    'BN': "সাহায্য পাওয়ার আবেদন লিঙ্ক: https://bangalifoundation.org/become-a-beneficiary/",
                    'TR': "Yararlanıcı Başvuru Formu: https://bangalifoundation.org/become-a-beneficiary/",
                    'AR': "طلب الحصول على مساعدة: https://bangalifoundation.org/become-a-beneficiary/"
                },
                'CLICK_PARTNER': {
                    'EN': "Partnership Form: https://bangalifoundation.org/become-a-partner/",
                    'BN': "পার্টনার বা সহযোগী ফর্ম: https://bangalifoundation.org/become-a-partner/",
                    'TR': "Ortaklık Formu: https://bangalifoundation.org/become-a-partner/",
                    'AR': "نموذج الشراكة: https://bangalifoundation.org/become-a-partner/"
                },
                'CLICK_PROJECTS': {
                    'EN': "Our Current Initiatives: https://bangalifoundation.org/our-initiatives/",
                    'BN': "আমাদের চলমান প্রকল্পসমূহ: https://bangalifoundation.org/our-initiatives/",
                    'TR': "Mevcut Girişimlerimiz: https://bangalifoundation.org/our-initiatives/",
                    'AR': "مبادراتنا الحالية: https://bangalifoundation.org/our-initiatives/"
                }
            };

            await sendToWhatsApp(waId, { type: "text", text: { body: links[payload][lang] } });
            await logUnlockedUser(waId);

            const unlockMsg = {
                'EN': "🔒 Menu exploration completed! You can now type any questions freely to speak directly with our WhatsApp AI assistant.",
                'BN': "🔒 মেনু সম্পন্ন হয়েছে! এখন আপনি আমাদের হোয়াটসঅ্যাপ এআই সহকারীর সাথে সরাসরি যেকোনো প্রশ্ন লিখে চ্যাট করতে পারেন।",
                'TR': "🔒 Menü incelemesi tamamlandı! Artık WhatsApp yapay zeka asistanımızla serbestçe konuşabilir ve sorularinizi sorabilirsiniz.",
                'AR': "🔒 اكتملت القائمة! يمكنك الآن كتابة أي أسئلة بحرية للتحدث مباشرة مع مساعد الذكاء الاصطناعي الخاص بنا."
            };
            await sendToWhatsApp(waId, { type: "text", text: { body: unlockMsg[lang] } });
        }
    } 
    // B. Free Text Messages Event Processing
    else if (messageEvent.type === 'text') {
        const text = messageEvent.text.body;
        const waId = messageEvent.from;
        const lang = await getUserLanguage(waId);
        const isUnlocked = await checkUserUnlocked(waId);

        if (!lang) {
            await sendLanguageSelector(waId);
        } else if (!isUnlocked) {
            await sendVerticalActionMenu(waId, lang);
        } else {
            const reply = await getSmartReply(text, waId, lang);
            await sendToWhatsApp(waId, { type: "text", text: { body: reply } });
        }
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🚀 Production Multi-Language AI Assistant Engine Online`));