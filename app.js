/*
 * Whizor Bot v1.0 - The Doctor Finder
 */
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(bodyParser.json());

// 1. Setup Supabase Connection
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// 2. Setup Meta API Info
const token = process.env.WHATSAPP_TOKEN; 
const myPhoneId = process.env.PHONE_ID; // We need to add this to .env later

// --- VERIFICATION (For Meta to check if we exist) ---
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === 'whizor_secret_123') {
      console.log('WEBHOOK_VERIFIED');
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  }
});

// --- THE MAIN EVENT: INCOMING MESSAGES ---
app.post('/webhook', async (req, res) => {
  res.sendStatus(200); // Reply "OK" instantly so Meta doesn't retry

  const body = req.body;

  if (body.object) {
    if (
      body.entry &&
      body.entry[0].changes &&
      body.entry[0].changes[0].value.messages &&
      body.entry[0].changes[0].value.messages[0]
    ) {
      const message = body.entry[0].changes[0].value.messages[0];
      const from = message.from; // User's WhatsApp Number
      const msgBody = message.text ? message.text.body.toLowerCase() : '';

      console.log(`Received: '${msgBody}' from ${from}`);

      // LOGIC: If user says "Hi", show Doctor List
      if (msgBody.includes('hi') || msgBody.includes('hello')) {
        await sendDoctorList(from);
      } 
      // Handle other messages later...
    }
  }
});

// --- FUNCTION: FETCH DOCTORS & SEND MENU ---
async function sendDoctorList(to) {
  try {
    // A. Ask Supabase for Doctors
    const { data: doctors, error } = await supabase
      .from('doctors')
      .select('id, name, specialization')
      .limit(10);

    if (error) {
        console.error('DB Error:', error);
        return;
    }

    if (!doctors || doctors.length === 0) {
        // Send a simple text if no doctors found
        await sendText(to, "Sorry, no doctors are available right now.");
        return;
    }

    // B. Build the WhatsApp "Section List"
    // We turn the database rows into WhatsApp Menu Rows
    const rows = doctors.map(doc => ({
      id: `doc_${doc.id}`, // e.g., "doc_123"
      title: doc.name,
      description: doc.specialization || 'General Physician'
    }));

    // C. Send the API Call to Meta
    await axios({
      method: 'POST',
      url: `https://graph.facebook.com/v17.0/${myPhoneId}/messages`,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      data: {
        messaging_product: 'whatsapp',
        to: to,
        type: 'interactive',
        interactive: {
          type: 'list',
          header: {
            type: 'text',
            text: 'Welcome to Whizor Clinic 🏥'
          },
          body: {
            text: 'Please select a doctor to book an appointment.'
          },
          footer: {
            text: 'Powered by Whizor'
          },
          action: {
            button: 'Find Doctor',
            sections: [
              {
                title: 'Available Doctors',
                rows: rows
              }
            ]
          }
        }
      }
    });
    console.log('Doctor List sent to ' + to);

  } catch (err) {
    console.error('Sending failed:', err.response ? err.response.data : err.message);
  }
}

// Simple helper for text messages
async function sendText(to, text) {
    await axios({
        method: 'POST',
        url: `https://graph.facebook.com/v17.0/${myPhoneId}/messages`,
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        data: { messaging_product: 'whatsapp', to: to, text: { body: text } }
    });
}

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Whizor Bot is listening on port ${PORT}`));