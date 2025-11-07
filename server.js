import 'dotenv/config';
import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import { nanoid } from 'nanoid';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 8080;
const SERVER_SECRET = process.env.SERVER_SECRET || null;
const HEARTBEAT_SECONDS = Number(process.env.HEARTBEAT_SECONDS || 30);

// roomName -> Set(ws)
const rooms = new Map();

function ensureRoom(room){ if (!rooms.has(room)) rooms.set(room, new Set()); return rooms.get(room); }
function membersOf(room){
  const set = rooms.get(room);
  if (!set) return [];
  return Array.from(set).filter(c=>c && c.id).map(c=>c.id);
}

function joinRoom(ws, room) { const set = ensureRoom(room); set.add(ws); ws.room = room; }
function leaveRoom(ws) {
  const room = ws.room;
  if (!room) return;
  const set = rooms.get(room);
  if (set) { set.delete(ws); if (set.size === 0) rooms.delete(room); }
  ws.room = null;
}

function broadcast(room, messageObj, exceptWs = null) {
  const set = rooms.get(room);
  if (!set) return;
  const data = JSON.stringify(messageObj);
  for (const client of set) {
    if (client.readyState === 1 && client !== exceptWs) { client.send(data); }
  }
}

function pushStats(room){
  const stats = { type:'room_stats', room, count: membersOf(room).length, members: membersOf(room), at: new Date().toISOString() };
  broadcast(room, stats, null);
}

wss.on('connection', (ws) => {
  ws.id = nanoid();
  ws.isAlive = true;

  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (buf) => {
    let msg;
    try { msg = JSON.parse(buf.toString()); } catch { return; }

    if (SERVER_SECRET && msg.serverSecret !== SERVER_SECRET) {
      ws.send(JSON.stringify({ type: 'error', error: 'unauthorized' }));
      return;
    }

    const { type } = msg;

    if (type === 'join') {
      // نستخدم token كاسم الغرفة مباشرة
      const { token } = msg;
      const room = (token && String(token).trim()) || 'default';
      joinRoom(ws, room);
      const joined = { type:'joined', room, id: ws.id, count: membersOf(room).length, members: membersOf(room), at: new Date().toISOString() };
      ws.send(JSON.stringify(joined));
      broadcast(room, { type: 'presence', who: ws.id, event: 'join', at: new Date().toISOString() }, ws);
      pushStats(room);
      return;
    }

    if (type === 'leave') {
      const roomLeft = ws.room;
      leaveRoom(ws);
      ws.send(JSON.stringify({ type: 'left', room: roomLeft }));
      if (roomLeft) {
        broadcast(roomLeft, { type: 'presence', who: ws.id, event: 'leave' }, ws);
        pushStats(roomLeft);
      }
      return;
    }

    if (type === 'ping') { ws.send(JSON.stringify({ type: 'pong' })); return; }

    if (type === 'broadcast') {
      if (!ws.room) return ws.send(JSON.stringify({ type: 'error', error: 'no-room' }));
      const { payload } = msg;
      broadcast(ws.room, { type: 'message', from: ws.id, payload, at: new Date().toISOString() }, ws);
      return;
    }
  });

  ws.on('close', () => {
    const wasRoom = ws.room;
    leaveRoom(ws);
    if (wasRoom) { broadcast(wasRoom, { type: 'presence', who: ws.id, event: 'leave' }); pushStats(wasRoom); }
  });
});

setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { try { ws.terminate(); } catch {} continue; }
    ws.isAlive = false;
    try { ws.ping(); } catch {}
  }
}, HEARTBEAT_SECONDS * 1000);

app.get('/health', (_req, res) => {
  const roomsObj = {};
  for (const [name, set] of rooms) roomsObj[name] = set.size;
  res.json({ ok: true, clients: wss.clients.size, rooms: roomsObj });
});

server.listen(PORT, () => console.log('WS server :' + PORT));
