import 'dotenv/config';
import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 8080;
const HEARTBEAT_SECONDS = Number(process.env.HEARTBEAT_SECONDS || 30);

const TOKENS_FROM_ENV = (process.env.TOKEN_LIST || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);


const ALLOWED_TOKENS_HARDCODED = [
   "mouad",
  // "team1",
  // "xyz"
];

// إذا كانت .env تحتوي توكنات → تُستخدم
// إذا كانت فارغة → نستخدم التي هنا فوق
const ALLOWED = new Set(
  TOKENS_FROM_ENV.length ? TOKENS_FROM_ENV : ALLOWED_TOKENS_HARDCODED
);
// ---------------------------------------------------------------------------

// كل token = غرفة
const rooms = new Map();
const room = token => (rooms.has(token) ? rooms : rooms.set(token, new Set()), rooms.get(token));
const count = token => (rooms.get(token)?.size || 0);

// إرسال رسالة لكل أعضاء الغرفة
function broadcast(token, obj, except = null) {
  const set = rooms.get(token);
  if (!set) return;
  const msg = JSON.stringify(obj);
  for (const c of set) {
    if (c.readyState === 1 && c !== except) c.send(msg);
  }
}

wss.on("connection", ws => {
  ws.isAlive = true;
  ws.on("pong", () => (ws.isAlive = true));

  ws.on("message", data => {
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }

    // انضمام المتصفح لغرفة حسب التوكن
    if (msg.type === "join") {
      const token = String(msg.token || "").trim();
      if (!token || !ALLOWED.has(token)) {
        ws.send(JSON.stringify({ type: "error", error: "forbidden-token" }));
        try { ws.close(); } catch {}
        return;
      }
      room(token).add(ws);
      ws.room = token;
      ws.send(JSON.stringify({ type: "joined", room: token, count: count(token) }));
      broadcast(token, { type: "room_stats", room: token, count: count(token) });
      return;
    }

    // استلام بث من أحد المتصفحات → إرساله للكل
    if (msg.type === "broadcast" && ws.room) {
      broadcast(ws.room, { type: "message", payload: msg.payload, at: Date.now() }, ws);
      return;
    }
  });

  ws.on("close", () => {
    const token = ws.room;
    if (!token) return;
    const set = rooms.get(token);
    if (set) {
      set.delete(ws);
      if (set.size === 0) rooms.delete(token);
    }
    broadcast(token, { type: "room_stats", room: token, count: count(token) });
  });
});

// فحص وإغلاق الاتصالات الميتة
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { try { ws.terminate(); } catch {} continue; }
    ws.isAlive = false;
    try { ws.ping(); } catch {}
  }
}, HEARTBEAT_SECONDS * 1000);

// فحص سريع
app.get("/health", (req, res) => {
  const r = {};
  for (const [name, set] of rooms) r[name] = set.size;
  res.json({ ok: true, clients: wss.clients.size, rooms: r, allowed: [...ALLOWED] });
});

server.listen(PORT, () => console.log("Server running on port " + PORT));
