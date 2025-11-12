// Token-locked WebSocket broadcast server
import 'dotenv/config';
import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 8080;
const HEARTBEAT_SECONDS = Number(process.env.HEARTBEAT_SECONDS || 30);

// === PLACE TOKEN(S) HERE ===
// Option 1 (recommended): via environment variable
//   TOKEN_LIST=mouad,teamA,xyz
const TOKENS_FROM_ENV = (process.env.TOKEN_LIST || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

// Option 2: hardcode list here if you prefer:
const ALLOWED_TOKENS_HARDCODED = [
  "mouad",
];

const ALLOWED = new Set(TOKENS_FROM_ENV.length ? TOKENS_FROM_ENV : ALLOWED_TOKENS_HARDCODED);

// room = token
const rooms = new Map(); // Map<token, Set<ws>>
const ensureRoom = (r)=>{ if(!rooms.has(r)) rooms.set(r,new Set()); return rooms.get(r); };
const count = (r)=> rooms.get(r)?.size || 0;

// index إضافي: room -> Map<instanceId, ws>
const roomIndexById = new Map(); // Map<token, Map<instanceId, ws>>
const idxFor = (room) => {
  if (!roomIndexById.has(room)) roomIndexById.set(room, new Map());
  return roomIndexById.get(room);
};

function broadcast(r,obj,except){
  const set = rooms.get(r); if(!set) return;
  const data = JSON.stringify(obj);
  for(const c of set){
    if(c.readyState===1 && c!==except) c.send(data);
  }
}

wss.on('connection', ws => {
  ws.isAlive = true;
  ws.on('pong', () => ws.isAlive = true);

  ws.on('message', buf => {
    let msg; try{ msg = JSON.parse(buf.toString()) }catch{ return; }

    if (msg.type === "join") {
      const token = String(msg.token || "").trim();
      const iid   = String(msg.instanceId || "").trim(); // NEW
      if (!token || !ALLOWED.has(token)) {
        try { ws.send(JSON.stringify({ type: "error", error: "forbidden-token" })); } catch {}
        try { ws.close(); } catch {}
        return;
      }

      const set = ensureRoom(token);
      const index = idxFor(token);

      // إذا متصفّح بنفس instanceId متصل سابقًا → نغلقه ونستبدله بالجديد
      if (iid && index.has(iid)) {
        const old = index.get(iid);
        try { old.send(JSON.stringify({ type: "kick", reason: "duplicate-instance" })); } catch {}
        try { old.close(); } catch {}
        set.delete(old);
      }

      set.add(ws);
      ws.room = token;
      ws.instanceId = iid || undefined;
      if (iid) index.set(iid, ws);

      try { ws.send(JSON.stringify({ type: "joined", room: token, count: count(token) })); } catch {}
      broadcast(token, { type: "room_stats", room: token, count: count(token) });
      return;
    }

    if (msg.type === "broadcast" && ws.room) {
      broadcast(ws.room, { type:"message", payload: msg.payload, at: Date.now() }, ws);
      return;
    }

    if (msg.type === "ping") {
      try { ws.send(JSON.stringify({ type:'pong' })); } catch {}
      return;
    }
  });

  ws.on('close', () => {
    const r = ws.room; if(!r) return;
    rooms.get(r)?.delete(ws);

    // إزالة فهرس instanceId عند الإغلاق
    const index = roomIndexById.get(r);
    if (index && ws.instanceId && index.get(ws.instanceId) === ws) {
      index.delete(ws.instanceId);
      if (index.size === 0) roomIndexById.delete(r);
    }

    if (count(r) === 0) rooms.delete(r);
    broadcast(r, { type:"room_stats", room:r, count:count(r) });
  });
});

// Heartbeat (terminate dead)
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { try { ws.terminate(); } catch {} continue; }
    ws.isAlive = false;
    try { ws.ping(); } catch {}
  }
}, HEARTBEAT_SECONDS * 1000);

app.get('/health', (req, res) => {
  const obj = {};
  for (const [r,set] of rooms) obj[r] = set.size;
  res.json({ ok:true, clients: wss.clients.size, rooms: obj, allowed: [...ALLOWED] });
});

server.listen(PORT, () => console.log("loginall-token-server running on :" + PORT));
