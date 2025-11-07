import 'dotenv/config';
import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 8080;
const HEARTBEAT_SECONDS = Number(process.env.HEARTBEAT_SECONDS || 30);

const TOKENS_FROM_ENV = (process.env.TOKEN_LIST || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

// مثال هاردكود — اكتب التوكنات هنا (إن رغبت بذلك).
// إذا قمت بملء TOKEN_LIST في .env فسيتم استخدام TOKEN_LIST أولاً.
const ALLOWED_TOKENS_HARDCODED = [
   "mouad",
  // "team-1",
  // "alpha"
];

// القاعدة: إذا وُجد TOKEN_LIST في البيئة فسوف نستخدمه، وإلا نستخدم الهاردكود.
const ALLOWED = new Set(TOKENS_FROM_ENV.length ? TOKENS_FROM_ENV : ALLOWED_TOKENS_HARDCODED);

// ---------------------------------------------------------------------------

/**
 * بيانات غرف/اتصالات:
 * rooms: Map< token, Set<ws> >
 */
const rooms = new Map();

function ensureRoom(name){
  if (!rooms.has(name)) rooms.set(name, new Set());
  return rooms.get(name);
}

function roomCount(name){
  return rooms.get(name)?.size || 0;
}

function joinRoom(ws, name){
  const set = ensureRoom(name);
  set.add(ws);
  ws.room = name;
}

function leaveRoom(ws){
  const r = ws.room;
  if (!r) return;
  const set = rooms.get(r);
  if (set) {
    set.delete(ws);
    if (set.size === 0) rooms.delete(r);
  }
  ws.room = null;
}

function broadcast(room, obj, except = null){
  const set = rooms.get(room); if (!set) return;
  const data = JSON.stringify(obj);
  for (const c of set) {
    if (c.readyState === 1 && c !== except) {
      c.send(data);
    }
  }
}

function pushStats(room){
  broadcast(room, { type: 'room_stats', room, count: roomCount(room) });
}

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (buf) => {
    let msg;
    try { msg = JSON.parse(buf.toString()); } catch { return; }

    if (msg.type === 'join') {
      const token = String(msg.token || '').trim();
      if (!token) {
        ws.send(JSON.stringify({ type: 'error', error: 'missing-token' }));
        try { ws.close(1008, 'missing token'); } catch {}
        return;
      }
      if (!ALLOWED.has(token)) {
        // توكن غير مصرح به — نخبر العميل ونقفل الاتصال
        ws.send(JSON.stringify({ type: 'error', error: 'forbidden-token' }));
        try { ws.close(1008, 'forbidden token'); } catch {}
        return;
      }

      // ناجح: انضم إلى غرفة التوكن
      joinRoom(ws, token);
      ws.send(JSON.stringify({ type: 'joined', room: token, count: roomCount(token) }));
      pushStats(token);
      return;
    }

    if (msg.type === 'leave') {
      const r = ws.room;
      leaveRoom(ws);
      if (r) pushStats(r);
      return;
    }

    if (msg.type === 'ping') {
      try { ws.send(JSON.stringify({ type: 'pong' })); } catch {}
      return;
    }

    if (msg.type === 'broadcast') {
      if (!ws.room) return;
      broadcast(ws.room, { type: 'message', payload: msg.payload, at: Date.now() }, ws);
      return;
    }
  });

  ws.on('close', () => {
    const r = ws.room;
    leaveRoom(ws);
    if (r) pushStats(r);
  });
});

// تنظيف الاتصالات الميتة بالنبض
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      try { ws.terminate(); } catch {}
      continue;
    }
    ws.isAlive = false;
    try { ws.ping(); } catch {}
  }
}, HEARTBEAT_SECONDS * 1000);

// نقطة صحّة لمراقبة الحالة
app.get('/health', (_req, res) => {
  const roomsObj = {};
  for (const [name, set] of rooms) roomsObj[name] = set.size;
  res.json({ ok: true, clients: wss.clients.size, rooms: roomsObj, allowed: Array.from(ALLOWED) });
});

server.listen(PORT, () => console.log('p2p-token-locked listening on :' + PORT));
