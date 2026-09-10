import express from 'express';
import pino from 'pino';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { makeWASocket, useMultiFileAuthState, Browsers, DisconnectReason } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const MESSAGE = process.env.MESSAGE || "Do not share your session ID with anyone!";

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const logger = pino({ level: 'silent' });

// Ensure sessions folder exists
fs.ensureDirSync('./sessions');

// Store active sockets
const activeSockets = new Map();

// ============================================================
//  ROUTES
// ============================================================

/**
 * POST /pair
 * Request a pairing code for a phone number.
 * Body: { phone: "254712345678" }
 */
app.post('/pair', async (req, res) => {
  const { phone } = req.body;

  if (!phone || phone.length < 7) {
    return res.status(400).json({ error: 'Please provide a valid phone number with country code (no + or spaces).' });
  }

  const sessionId = `session_${Date.now()}_${phone}`;
  const sessionDir = `./sessions/${sessionId}`;

  try {
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

    const sock = makeWASocket({
      logger,
      printQRInTerminal: false,
      auth: state,
      browser: ['Sir Bravin Session Gen', 'Chrome', '1.0.0'],
      generateHighQualityLinkPreview: false
    });

    sock.ev.on('creds.update', saveCreds);

    // Store socket for later use
    activeSockets.set(sessionId, { sock, sessionDir, phone });

    // Wait for the socket to be ready
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Connection timeout')), 30000);
      sock.ev.on('connection.update', (update) => {
        if (update.connection === 'open') {
          clearTimeout(timeout);
          resolve();
        }
        if (update.connection === 'close') {
          clearTimeout(timeout);
          const statusCode = new Boom(update.lastDisconnect?.error)?.output?.statusCode;
          if (statusCode === DisconnectReason.loggedOut) {
            reject(new Error('Logged out'));
          }
        }
      });
    });

    // Request pairing code
    const code = await sock.requestPairingCode(phone);

    res.json({
      success: true,
      sessionId,
      code,
      message: MESSAGE
    });

  } catch (err) {
    console.error('Pair error:', err);
    res.status(500).json({ error: err.message || 'Failed to generate pairing code.' });
  }
});

/**
 * GET /session/:sessionId
 * Check if the session is authenticated and get the SESSION_ID.
 */
app.get('/session/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  const entry = activeSockets.get(sessionId);

  if (!entry) {
    return res.status(404).json({ error: 'Session not found. Please request a new pairing code.' });
  }

  const { sock, sessionDir } = entry;

  try {
    // Check if creds are registered (user has linked the device)
    const credsPath = path.join(sessionDir, 'creds.json');
    if (!fs.existsSync(credsPath)) {
      return res.json({ success: false, status: 'waiting', message: 'Waiting for you to link the device...' });
    }

    const creds = JSON.parse(fs.readFileSync(credsPath, 'utf-8'));
    if (!creds.registered) {
      return res.json({ success: false, status: 'waiting', message: 'Waiting for you to link the device...' });
    }

    // Read all session files and encode as base64 JSON
    const files = fs.readdirSync(sessionDir);
    const sessionData = {};

    for (const file of files) {
      if (file.endsWith('.json')) {
        sessionData[file] = fs.readFileSync(path.join(sessionDir, file), 'utf-8');
      }
    }

    const sessionIdBase64 = Buffer.from(JSON.stringify(sessionData)).toString('base64');

    // Clean up socket
    try { sock.end(); } catch (e) {}
    activeSockets.delete(sessionId);
    fs.removeSync(sessionDir);

    res.json({
      success: true,
      status: 'ready',
      sessionId: sessionIdBase64,
      message: 'Session generated successfully! Copy the SESSION_ID below.'
    });

  } catch (err) {
    console.error('Session error:', err);
    res.status(500).json({ error: err.message || 'Failed to retrieve session.' });
  }
});

// ============================================================
//  SERVE FRONTEND
// ============================================================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================================
//  START SERVER
// ============================================================
app.listen(PORT, () => {
  console.log(`👑 Sir Bravin Session Generator running on http://localhost:${PORT}`);
  console.log(`📋 Message: ${MESSAGE}`);
});
