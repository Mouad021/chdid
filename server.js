import 'dotenv/config';
import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 8080;
const SERVER_TOKEN = process.env.SERVER_TOKEN || ''; // التوكن المطلوب، اتركه فارغًا لتعطيل الفحص
const HEARTBEAT_SECONDS = Number(process.env.HEARTBEAT_SECONDS || 30);

// token(room) -> Set(ws)
const rooms = new Map();

function ensureRoom(room){ if (!rooms.has(room)) rooms.set(room, new Set()); return rooms.get(room); }
function countOf(room){ const set = rooms.get(room); return set ? set.size : 0; }

function joinRoom(ws, room) {
  const set = ensureRoom(room);
  set.add(ws); ws.room = room;
}
function leaveRoom(ws) {
  const room = ws.room; if (!room) return;
  const set = rooms.get(room);
  if (set) { set.delete(ws); if (set.size === 0) rooms.delete(room); }
  ws.room = null;
}
function broadcast(room, obj, except=null){
  const set = rooms.get(room); if (!set) return;
  const data = JSON.stringify(obj);
  for (const c of set) if (c.readyState === 1 && c !== except) c.send(data);
}
function pushStats(room){
  broadcast(room, { type:'room_stats', room, count: countOf(room) });
}

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (buf) => {
    let msg;
    try { msg = JSON.parse(buf.toString()); } catch { return; }

    // فقط عند رسالة join نتحقق من التوكن
    if (msg.type === 'join') {
      const token = (msg.token && String(msg.token).trim()) || 'default';

      // إذا تم ضبط SERVER_TOKEN على السيرفر، قارن بينهما
      if (SERVER_TOKEN && token !== SERVER_TOKEN) {
        // أرسل خطأ و أغلق الاتصال فوراً
        try {
          ws.send(JSON.stringify({ type: 'error', error: 'unauthorized', reason: 'invalid token' }));
        } catch (e) {}
        try { ws.close(4001, 'unauthorized'); } catch (e) {}
        return;
      }

      // إذا تطابق التوكن أو لم يتم تفعيل فحص التوكن
      const room = token;
      joinRoom(ws, room);
      ws.send(JSON.stringify({ type:'joined', room, count: countOf(room) }));
      broadcast(room, { type: 'presence', who: null, event: 'join', at: new Date().toISOString() }, ws);
      pushStats(room);
      return;
    }

    if (msg.type === 'leave') {
      const r = ws.room; leaveRoom(ws); if (r) pushStats(r); return;
    }

    if (msg.type === 'ping') { try { ws.send(JSON.stringify({ type:'pong' })); } catch {} return; }

    if (msg.type === 'broadcast') {
      if (!ws.room) return;
      broadcast(ws.room, { type:'message', payload: msg.payload, at: Date.now() }, ws);
      return;
    }
  });

  ws.on('close', () => { const r = ws.room; leaveRoom(ws); if (r) pushStats(r); });
});

setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { try { ws.terminate(); } catch {} continue; }
    ws.isAlive = false;
    try { ws.ping(); } catch {}
  }
}, HEARTBEAT_SECONDS * 1000);

app.get('/health', (_req, res) => {
  const roomsObj = {}; for (const [name, set] of rooms) roomsObj[name] = set.size;
  res.json({ ok: true, clients: wss.clients.size, rooms: roomsObj });
});

server.listen(PORT, () => console.log('WS server :' + PORT));
