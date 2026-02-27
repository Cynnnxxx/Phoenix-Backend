/**
 * Arsenic Anticheat WebSocket Server
 * Accepts connections from the Arsenic client (DLL), performs key exchange,
 * validates auth token against the backend, and responds to ping/challenge. //litereally made by cynx if u use ts for a project please credit me 
 * Connects the backend anticheat system with the Arsenic client.
 */

const WebSocket = require("ws");
const http = require("http");
const crypto = require("crypto");
const log = require("../structs/log.js");

// AES key hardcoded in Arsenic client (Socket.cpp) - must match for decrypt/encrypt
const ARSENIC_AES_KEY = Buffer.from([
  0x4a, 0x73, 0x7b, 0x63, 0x78, 0x20, 0x40, 0x59,
  0x11, 0x1e, 0x2e, 0x67, 0x2b, 0x7e, 0x4f, 0x56,
  0x09, 0x5e, 0x7c, 0x4f, 0x31, 0x57, 0x2c, 0x66,
  0x5f, 0x75, 0x32, 0x43, 0x12, 0x45, 0x36, 0x72
]);

/**
 * Derive signing key from the 16-byte payload the client sends (XOR chain)
 */
function deriveSigningKey(clientPayload) {
  if (clientPayload.length < 16) return null;
  const out = Buffer.alloc(16);
  out[0] = clientPayload[0];
  for (let i = 1; i < 16; i++) {
    out[i] = clientPayload[i] ^ out[i - 1];
  }
  return out;
}

/**
 * Verify HMAC-SHA256 and decrypt AES-256-CTR payload.
 * Format: [ciphertext][iv 16][hmac 32]
 */
function decrypt(signingKey, encrypted) {
  if (encrypted.length < 48) return null;
  const cipherLen = encrypted.length - 48;
  const ciphertext = encrypted.subarray(0, cipherLen);
  const iv = encrypted.subarray(cipherLen, cipherLen + 16);
  const sig = encrypted.subarray(cipherLen + 16, cipherLen + 48);

  const hmac = crypto.createHmac("sha256", signingKey);
  hmac.update(encrypted.subarray(0, cipherLen));
  const expectedSig = hmac.digest();
  if (!crypto.timingSafeEqual(sig, expectedSig)) return null;

  const decipher = crypto.createDecipheriv("aes-256-ctr", ARSENIC_AES_KEY, iv);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString("utf8");
}

/**
 * Encrypt plaintext and append IV + HMAC (same format as client expects)
 */
function encrypt(signingKey, plaintext) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-ctr", ARSENIC_AES_KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);

  const hmac = crypto.createHmac("sha256", signingKey);
  hmac.update(ciphertext);
  const sig = hmac.digest();

  return Buffer.concat([ciphertext, iv, sig]);
}

/**
 * Verify Bearer token against backend (same JWT / session as launcher)
 */
async function verifyAuthToken(token) {
  try {
    const User = require("../model/user.js");
    const jwt = require("jsonwebtoken");
    const config = require("../Config/config.json");
    const secret = global.JWT_SECRET;
    if (!secret || !token) return null;
    const clean = token.replace(/^eg1~/, "");
    const decoded = jwt.verify(clean, secret);
    if (!decoded || !decoded.sub) return null;
    const user = await User.findOne({ accountId: decoded.sub }).lean();
    return user ? { accountId: user.accountId, username: user.username } : null;
  } catch (e) {
    return null;
  }
}

function createArsenicSocketServer(port, anticheatSystem) {
  const httpServer = http.createServer();
  const wss = new WebSocket.Server({
    server: httpServer,
    perMessageDeflate: false,
    clientTracking: true
  });

  const connections = new Map(); // ws -> { signingKey, accountId, username, authenticated }

  wss.on("connection", (ws, req) => {
    const key = `${req.socket.remoteAddress}:${Date.now()}`;
    connections.set(ws, { state: "expect_key", signingKey: null, accountId: null, username: null });

    ws.on("message", async (data) => {
      const conn = connections.get(ws);
      if (!conn) return;

      const raw = Buffer.isBuffer(data) ? data : Buffer.from(data);
      if (conn.state === "expect_key") {
        if (raw.length === 16) {
          conn.signingKey = deriveSigningKey(raw);
          conn.state = "ready";
        }
        return;
      }

      if (!conn.signingKey) return;
      const jsonStr = decrypt(conn.signingKey, raw);
      if (!jsonStr) return;

      let msg;
      try {
        msg = JSON.parse(jsonStr);
      } catch (e) {
        return;
      }

      if (msg.status === "auth") {
        const backend = msg.backend || "";
        const token = msg.token || "";
        const hwid = msg.hwid || "";
        const user = await verifyAuthToken(token);
        if (user) {
          conn.accountId = user.accountId;
          conn.username = user.username;
          conn.authenticated = true;
          const response = JSON.stringify({ success: true });
          ws.send(encrypt(conn.signingKey, response));
          log.anticheat(`[Arsenic] Client authenticated: ${user.username} (${user.accountId})`);
        } else {
          const response = JSON.stringify({ success: false });
          ws.send(encrypt(conn.signingKey, response));
        }
        return;
      }

      if (msg.status === "challenge") {
        const response = JSON.stringify({ success: true });
        ws.send(encrypt(conn.signingKey, response));
        return;
      }

      if (msg.status === "pong") {
        // client responded to our ping
        return;
      }

      if (msg.status === "detected") {
        const message = msg.message || "Detected traces!";
        if (conn.accountId && conn.username && anticheatSystem) {
          anticheatSystem.logViolation(conn.accountId, conn.username, "Arsenic: " + message, 8, { source: "arsenic_socket" }).catch(() => {});
        }
        log.anticheat(`[Arsenic] Detection from ${conn.username || "unknown"}: ${message}`);
      }
    });

    ws.on("close", () => {
      connections.delete(ws);
    });

    ws.on("error", () => {
      connections.delete(ws);
    });
  });

  // Optional: ping clients periodically so they respond with pong
  const pingInterval = setInterval(() => {
    for (const [ws, conn] of connections) {
      if (ws.readyState === WebSocket.OPEN && conn.signingKey && conn.state === "ready") {
        try {
          const payload = JSON.stringify({ ping: true });
          ws.send(encrypt(conn.signingKey, payload));
        } catch (e) {}
      }
    }
  }, 30000);

  httpServer.on("close", () => clearInterval(pingInterval));

  return new Promise((resolve, reject) => {
    httpServer.listen(port, "0.0.0.0", () => {
      log.anticheat(`[Arsenic] Socket server listening on ws://0.0.0.0:${port}`);
      resolve({ server: httpServer, wss, connections });
    });
    httpServer.on("error", reject);
  });
}

module.exports = { createArsenicSocketServer, deriveSigningKey, decrypt, encrypt };
