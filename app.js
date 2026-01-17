/*
 * Whizor Bot v2.0 - The Booking Manager
 */
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(bodyParser.json());

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const token = process.env.WHATSAPP_TOKEN; 
const myPhoneId = process.env.PHONE_ID;

// --- VERIFICATION ---
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === 'whizor_secret_123') {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// --- INCOMING MESSAGES ---
app.post('/webhook', async (req, res) => {
  res.sendStatus(200); // Always reply OK first

  const body = req.body;
  
  // Check if it's a message
  if (body.object && body.entry && body.entry[0].changes && body.entry[0].changes[0].value.messages) {
      
      const message = body.entry[0].changes[0].value.messages[0];
      const from = message.from;
      
      // LOG EVERYTHING (So we can see if it arrives)
      console.log(`📩 NEW MSG from ${from}`);
      console.log(JSON.stringify(message, null, 2));

      // 1. Handle TEXT ("Hi")
      if (message.type === 'text') {
        const msgBody = message.text.body.toLowerCase();
        if (msgBody.includes('hi') || msgBody.includes('hello')) {
            await sendDoctorList(from);
        }
      }

      // 2. Handle BUTTON/LIST CLICKS ("Dr. Amith")
      else if (message.type === 'interactive') {
        const replyId = message.interactive.list_reply 
                        ? message.interactive.list_reply.id 
                        : message.interactive.button_reply.id;
        
        console.log(`User clicked: ${replyId}`);

        if (replyId.startsWith('doc_')) {
            // User selected a doctor, confirm booking!
            const docName = message.interactive.list_reply.title;
            await sendBookingConfirmation(from, docName);
        }
      }
  }
});

// --- HELPER FUNCTIONS ---

async function sendDoctorList(to) {
  // Fetch doctors from DB
  const { data: doctors } = await supabase.from('doctors').select('id, name, specialization').limit(10);
  
  if (!doctors || doctors.length === 0) return sendText(to, "No doctors available.");

  const rows = doctors.map(doc => ({
    id: `doc_${doc.id}`,
    title: doc.name,
    description: doc.specialization
  }));

  await axios({
    method: 'POST',
    url: `https://graph.facebook.com/v17.0/${myPhoneId}/messages`,
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: {
      messaging_product: 'whatsapp',
      to: to,
      type: 'interactive',
      interactive: {
        type: 'list',
        header: { type: 'text', text: 'Whizor Clinic 🏥' },
        body: { text: 'Select a doctor to book token.' },
        footer: { text: 'Fast & Easy' },
        action: {
          button: 'Find Doctor',
          sections: [{ title: 'Available Today', rows: rows }]
        }
      }
    }
  });
}

async function sendBookingConfirmation(to, doctorName) {
    // In real life, we would save to DB here.
    // For now, just send the "Ticket"
    const randomToken = Math.floor(Math.random() * 20) + 1;
    
    await sendText(to, `✅ *Booking Confirmed!*\n\nDoctor: ${doctorName}\nToken: *#${randomToken}*\nEst. Wait: 20 mins`);
}

async function sendText(to, text) {
    await axios({
        method: 'POST',
        url: `https://graph.facebook.com/v17.0/${myPhoneId}/messages`,
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        data: { messaging_product: 'whatsapp', to: to, text: { body: text } }
    });
}

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Whizor Bot V2 listening on port ${PORT}`));