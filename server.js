import 'dotenv/config';
import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// إعدادات
const PORT = process.env.PORT || 8080;
const HEARTBEAT_SECONDS = Number(process.env.HEARTBEAT_SECONDS || 30);

const TOKENS_FROM_ENV = (process.env.TOKEN_LIST || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);


const ALLOWED_TOKENS_HARDCODED = [
   "mouad",
  // "team123"
];

// أي واحدة موجودة سيتم اعتمادها
const ALLOWED = new Set(
  TOKENS_FROM_ENV.length > 0 ? TOKENS_FROM_ENV : ALLOWED_TOKENS_HARDCODED
);

// الغرف (كل token = غرفة)
const rooms = new Map(); // token -> Set<WebSocket>

function ensureRoom(token){
  if(!rooms.has(token)) rooms.set(token, new Set());
  return rooms.get(token);
}
function count(token){
  return rooms.get(token)?.size || 0;
}

// بث رسالة داخل غرفة معينة
function broadcast(token, data, except = null){
  const room = rooms.get(token);
  if(!room) return;
  const msg = JSON.stringify(data);
  for(const client of room){
    if(client.readyState === 1 && client !== except){
      client.send(msg);
    }
  }
}

// اتصال جديد
wss.on('connection', ws => {
  ws.isAlive = true;
  ws.on('pong', () => ws.isAlive = true);

  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    // الانضمام إلى غرفة
    if(msg.type === 'join'){
      const token = (msg.token || '').trim();
      if(!token || !ALLOWED.has(token)){
        ws.send(JSON.stringify({ type:"error", error:"forbidden-token" }));
        try{ ws.close(); }catch{}
        return;
      }
      ensureRoom(token).add(ws);
      ws.room = token;
      ws.send(JSON.stringify({ type:"joined", room:token, count:count(token) }));
      broadcast(token, { type:"room_stats", room:token, count:count(token) });
      return;
    }

    // بث من متصفح → بقية المتصفحات
    if(msg.type === 'broadcast' && ws.room){
      broadcast(ws.room, { type:"message", payload:msg.payload, at:Date.now() }, ws);
      return;
    }
  });

  ws.on('close', () => {
    const token = ws.room;
    if(!token) return;
    const room = rooms.get(token);
    if(room){
      room.delete(ws);
      if(room.size === 0) rooms.delete(token);
      broadcast(token, { type:"room_stats", room:token, count:count(token) });
    }
  });
});

// فحص نبضات الاتصال
setInterval(() => {
  for(const ws of wss.clients){
    if(!ws.isAlive){
      try{ ws.terminate(); }catch{}
      continue;
    }
    ws.isAlive = false;
    try{ ws.ping(); }catch{}
  }
}, HEARTBEAT_SECONDS * 1000);

// فحص سريع للاتصال
app.get('/health', (req, res) => {
  const info = {};
  for(const [token,set] of rooms) info[token] = set.size;
  res.json({ ok:true, clients:wss.clients.size, rooms:info, allowed:[...ALLOWED] });
});

server.listen(PORT, () => {
  console.log("✅ WebSocket Token Server Running on port: " + PORT);
});
