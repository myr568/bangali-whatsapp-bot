const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const { google } = require('googleapis');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
app.use(bodyParser.json());

// --- ENVIRONMENT CONFIGURATIONS ---
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN; 
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID; 
const SPREADSHEET_ID = '16kuhcidjptgfxqaB1y0ujeEb59zrewVkUw7o6bVWynw';

// Gemini AI Config
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const aiModel = genAI.getGenerativeModel({ 
    model: "gemini-2.5-flash", 
    systemInstruction: "You are the official AI assistant for the Bangali Foundation on WhatsApp. Website: https://bangalifoundation.org/. Keep answers polite, brief, and in the user's language."
});

// Google Sheets Auth Connection
let keys = JSON.parse(process.env.GOOGLE_CREDS);
const client = new google.auth.JWT(
    keys.client_email, null, keys.private_key,
    ['https://www.googleapis.com/auth/spreadsheets']
);

// --- WHATSAPP API TRANSMISSION ENGINE ---
async function sendToWhatsApp(to, dataPayload) {
    try {
        const url = `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`;
        await axios.post(url, {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: to,
            ...dataPayload
        }, { headers: { Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}` } });
        console.log(`✅ Message safely pushed out to WhatsApp recipient: ${to}`);
    } catch (e) { 
        console.error("❌ WHATSAPP API TRANSMISSION ERROR:");
        if (e.response) console.error(JSON.stringify(e.response.data, null, 2));
    }
}

// --- MAIN API LOGIC / USER SELECTIONS ---
app.get('/webhook', (req, res) => {
    const verifyToken = 'bangali_foundation_2026';
    if (req.query['hub.verify_token'] === verifyToken) return res.send(req.query['hub.challenge']);
    res.status(403).send('Verification failed');
});

app.post('/webhook', async (req, res) => {
    const body = req.body;
    res.status(200).send('EVENT_RECEIVED'); // Instantly acknowledge Meta

    // Verify this is an actual inbound message event payload
    if (!body.entry || !body.entry[0].changes || !body.entry[0].changes[0].value.messages) return;

    const messageEvent = body.entry[0].changes[0].value.messages[0];
    const waId = messageEvent.from; // User's phone number string
    
    console.log(`📩 Received a message from: ${waId}`);

    // Fallback simple echo engine for test validation
    if (messageEvent.type === 'text') {
        const userText = messageEvent.text.body;
        console.log(`🗣️ User said: "${userText}"`);
        
        // Let's reply immediately with a text block confirming communication works!
        await sendToWhatsApp(waId, {
            type: "text",
            text: { body: `👋 Hello! Your WhatsApp webhook is perfectly connected. You said: "${userText}"` }
        });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Dedicated WhatsApp Testing Server Active`));