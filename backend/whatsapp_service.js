const express = require('express');
const cors = require('cors');
const qrcode = require('qrcode');
const path = require('path');
const fs = require('fs');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.WHATSAPP_SERVICE_PORT || 8006;
const FASTAPI_URL = process.env.FASTAPI_URL || 'http://127.0.0.1:8005';
const SESSIONS_DIR = path.join(__dirname, 'sessions');
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads', 'images');

if (!fs.existsSync(SESSIONS_DIR)) {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const activeSessions = new Map();

async function initWhatsAppSession(userId, forceRestart = false) {
  const userIdStr = String(userId || 1);

  if (forceRestart) {
    if (activeSessions.has(userIdStr)) {
      const s = activeSessions.get(userIdStr);
      try { await s.client.destroy(); } catch(e) {}
      activeSessions.delete(userIdStr);
    }
    const sessionPath = path.join(SESSIONS_DIR, `session-${userIdStr}`);
    for (let i = 0; i < 5; i++) {
      try {
        if (fs.existsSync(sessionPath)) {
          fs.rmSync(sessionPath, { recursive: true, force: true });
        }
        break;
      } catch (e) {
        if (i === 4) console.log(`[WhatsApp-Web Service] Force restart could not remove directory:`, e.message);
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }

  if (activeSessions.has(userIdStr)) {
    const existing = activeSessions.get(userIdStr);
    if (!forceRestart && (existing.connected || existing.qrBase64)) {
      return existing;
    }
  }

  const client = new Client({
    authStrategy: new LocalAuth({
        clientId: userIdStr,
        dataPath: SESSIONS_DIR
    }),
    puppeteer: {
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    }
  });

  const sessionObj = {
    userId: userIdStr,
    connected: false,
    phone: null,
    qrBase64: null,
    client: client,
    connecting: true,
    botSentMessageIds: new Set(),
    recentBotResponses: new Set()
  };

  activeSessions.set(userIdStr, sessionObj);

  client.on('qr', async (qr) => {
    try {
      const qrDataUrl = await qrcode.toDataURL(qr);
      sessionObj.qrBase64 = qrDataUrl;
      sessionObj.connected = false;
      console.log(`[WhatsApp-Web Service] Generated Fresh QR Code for User ${userIdStr}`);
    } catch (err) {
      console.error(`[WhatsApp-Web QR Error]:`, err);
    }
  });

  client.on('ready', () => {
    sessionObj.connected = true;
    sessionObj.qrBase64 = null;
    sessionObj.connecting = false;
    sessionObj.phone = client.info.wid.user ? `+${client.info.wid.user}` : 'Connected';
    console.log(`[WhatsApp-Web Service] User ${userIdStr} connected successfully (${sessionObj.phone})`);
  });

  client.on('disconnected', (reason) => {
    console.log(`[WhatsApp-Web Service] User ${userIdStr} disconnected:`, reason);
    sessionObj.connected = false;
    sessionObj.connecting = false;
    activeSessions.delete(userIdStr);
  });

  // Handle incoming messages AND messages sent by yourself
  client.on('message_create', async (msg) => {
    // Only process messages sent BY ME (Message Yourself)
    if (!msg.fromMe) return;

    // Ignore messages sent by the bot itself to prevent infinite loops
    if (sessionObj.botSentMessageIds.has(msg.id.id)) return;
    if (sessionObj.recentBotResponses.has(msg.body)) return;

    // Ensure the message is actually sent to our own number
    const myNumber = client.info.wid.user + '@c.us';
    
    let isSelfChat = false;
    if (msg.to === myNumber || msg.to === client.info.wid._serialized || msg.to === msg.from) {
      isSelfChat = true;
    } else if (msg.to.endsWith('@lid')) {
      // Strictly verify if this @lid belongs to the user themselves
      try {
        const toContact = await client.getContactById(msg.to);
        if (toContact && (toContact.isMe || toContact.number === client.info.wid.user)) {
          isSelfChat = true;
        }
      } catch (err) {
        console.error("[WhatsApp-Web Service] Error checking contact for @lid:", err);
      }
    }
                       
    if (!isSelfChat) {
      return;
    }
    console.log(`[WhatsApp-Web Service] Received a message from self. Processing...`);

    const cleanPhone = client.info.wid.user;
    const sessionId = `whatsapp_${cleanPhone}`;

    try {
      let solution = '';
      const textMessage = msg.body || '';

      let targetMsg = msg;
      if (msg.hasQuotedMsg) {
        try {
          const quoted = await msg.getQuotedMessage();
          if (quoted && quoted.hasMedia) {
            targetMsg = quoted;
          }
        } catch (e) {
          console.warn("[WhatsApp-Web Service] Failed to get quoted message");
        }
      }

      if (targetMsg.hasMedia) {
        let media = null;
        try {
          // Add a delay to allow the media to fully sync to the web client before downloading
          await new Promise(r => setTimeout(r, 2500));
          media = await targetMsg.downloadMedia();
        } catch (downloadErr) {
          console.warn("[WhatsApp-Web Service] Media download failed, retrying by fetching history...", downloadErr.message);
          try {
            await new Promise(r => setTimeout(r, 3000));
            // Workaround: Fetch the message from chat history to force media model loading
            const chat = await targetMsg.getChat();
            const recentMsgs = await chat.fetchMessages({ limit: 5 });
            const fetchedMsg = recentMsgs.find(m => m.id.id === targetMsg.id.id);
            
            if (fetchedMsg && fetchedMsg.hasMedia) {
                media = await fetchedMsg.downloadMedia();
            } else {
                media = await targetMsg.downloadMedia();
            }
            
            if (!media) throw new Error("Media is undefined after fetch");
          } catch (finalErr) {
            console.error("[WhatsApp-Web Service] Final media download failed:", finalErr.message);
            solution = "⚠️ *Error:* I received your message, but WhatsApp Web failed to extract the image data. \n\n*Workaround:* Please **reply** to the image you just sent (quote it) with any text (like 'solve'), and I will try to grab it from the quoted message! Alternatively, upload it via **Telegram** / **Web App**.";
          }
        }

        if (media && media.mimetype && media.mimetype.startsWith('image/')) {
          const buffer = Buffer.from(media.data, 'base64');
          const filename = `${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
          const filePath = path.join(UPLOADS_DIR, filename);
          fs.writeFileSync(filePath, buffer);

          const prompt = textMessage || 'Analyze and solve the problem shown in this image.';
          
          // Fix for native fetch: Use Node's global Blob and FormData instead of 'form-data' NPM package
          const fileBuffer = fs.readFileSync(filePath);
          const blob = new Blob([fileBuffer], { type: media.mimetype });
          const formData = new FormData(); 
          formData.append('image', blob, filename);
          formData.append('message', prompt);
          formData.append('session_id', sessionId);
          formData.append('channel', 'whatsapp');
          formData.append('user_id', userIdStr);

          const res = await fetch(`${FASTAPI_URL}/api/chat/image`, {
            method: 'POST',
            body: formData
          });

          if (res.ok) {
            const data = await res.json();
            solution = data.solution;
          }
        }
      } else if (textMessage) {
        const res = await fetch(`${FASTAPI_URL}/ask`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: textMessage,
            channel: 'whatsapp',
            session_id: sessionId,
            user_id: parseInt(userIdStr)
          })
        });

        if (res.ok) {
          const data = await res.json();
          solution = data.solution;
        }
      }

      if (solution) {
        sessionObj.recentBotResponses.add(solution);
        const sentMsg = await client.sendMessage(msg.to, solution);
        if (sentMsg && sentMsg.id && sentMsg.id.id) {
          sessionObj.botSentMessageIds.add(sentMsg.id.id);
        }
        console.log(`[WhatsApp-Web Service] Sent AI response to ${msg.to}`);
      }
    } catch (err) {
      console.error(`[WhatsApp-Web Message Error]:`, err);
    }
  });

  client.initialize().catch(err => {
    console.error(`[WhatsApp-Web Init Error]:`, err);
    sessionObj.error = err.message || "Failed to initialize WhatsApp client.";
  });

  return sessionObj;
}

// API Routes
app.get('/api/wa/qr', async (req, res) => {
  const userId = req.query.user_id || 1;
  const sessionObj = await initWhatsAppSession(userId, req.query.force === 'true');

  // Wait up to 20 seconds for QR code to be generated or client to be ready
  for (let i = 0; i < 40; i++) {
    if (sessionObj.qrBase64 || sessionObj.connected || sessionObj.error) break;
    await new Promise((r) => setTimeout(r, 500));
  }

  if (sessionObj.error) {
    return res.status(500).json({ error: sessionObj.error });
  }

  return res.json({
    qr_code: sessionObj.qrBase64,
    connected: sessionObj.connected,
    phone: sessionObj.phone,
    connecting: sessionObj.connecting
  });
});

app.get('/api/wa/status', async (req, res) => {
  const userId = req.query.user_id || 1;
  const userIdStr = String(userId);
  const sessionObj = activeSessions.get(userIdStr);

  if (!sessionObj) {
    return res.json({ connected: false, phone: 'Disconnected' });
  }

  return res.json({
    connected: sessionObj.connected,
    phone: sessionObj.phone || (sessionObj.connected ? 'Linked' : 'Disconnected'),
    qr_code: sessionObj.qrBase64
  });
});

app.post('/api/wa/logout', async (req, res) => {
  const userId = req.query.user_id || 1;
  const userIdStr = String(userId);

  if (activeSessions.has(userIdStr)) {
    const sessionObj = activeSessions.get(userIdStr);
    try {
      if (sessionObj.client) {
        try { await sessionObj.client.logout(); } catch(e) {}
        try { await sessionObj.client.destroy(); } catch(e) {}
      }
    } catch (e) {}
    activeSessions.delete(userIdStr);
  }

  const sessionPath = path.join(SESSIONS_DIR, `session-${userIdStr}`);
  let retries = 5;
  const tryDelete = () => {
    try {
      if (fs.existsSync(sessionPath)) {
        fs.rmSync(sessionPath, { recursive: true, force: true });
        console.log(`[WhatsApp-Web Service] Successfully deleted session directory for User ${userIdStr}`);
      }
    } catch (e) {
      if (retries > 0) {
        retries--;
        setTimeout(tryDelete, 1000);
      } else {
        console.log(`[WhatsApp-Web Service] Failed to delete session directory after retries: ${e.message}`);
      }
    }
  };
  setTimeout(tryDelete, 1000);

  return res.json({ status: 'success', message: 'WhatsApp session logged out successfully.' });
});

process.on('uncaughtException', (err) => {
  console.error('[WhatsApp-Web UncaughtException]:', err.message || err);
});

process.on('unhandledRejection', (err) => {
  console.error('[WhatsApp-Web UnhandledRejection]:', err.message || err);
});

app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`NexusAI whatsapp-web.js Service running on port ${PORT}`);
  console.log(`Targeting FastAPI Backend: ${FASTAPI_URL}`);
  console.log(`====================================================`);

  // Auto-load existing sessions on startup
  try {
    const sessionDirs = fs.readdirSync(SESSIONS_DIR);
    for (const dir of sessionDirs) {
      if (dir.startsWith('session-')) {
        const userId = dir.replace('session-', '');
        console.log(`[WhatsApp-Web Service] Auto-restoring session for User ${userId}...`);
        initWhatsAppSession(userId).catch(e => console.error(e));
      }
    }
  } catch (err) {
    console.error(`[WhatsApp-Web Service] Error auto-loading sessions:`, err);
  }
});
