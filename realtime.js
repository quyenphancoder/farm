import crypto from "node:crypto";
import { t } from "./i18n.js";

const MAX_ROOM_PLAYERS = 8;
const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function registerOnlineRooms(io) {
  const rooms = new Map();
  const disconnectTimers = new Map();

  io.on("connection", (socket) => {
    const recoveredPlayerKey = socket.data.onlinePlayerKey;
    if (recoveredPlayerKey) {
      clearTimeout(disconnectTimers.get(recoveredPlayerKey));
      disconnectTimers.delete(recoveredPlayerKey);
    }

    socket.on("online:create", (payload = {}, reply = () => {}) => {
      leaveRoom(io, rooms, disconnectTimers, socket);

      const roomId = createRoomId(rooms);
      const playerKey = normalizePlayerKey(payload.playerKey, socket.id);
      const room = {
        id: roomId,
        hostId: playerKey,
        players: new Map()
      };
      room.players.set(playerKey, {
        id: playerKey,
        socketId: socket.id,
        name: normalizeName(payload.name, payload.language)
      });
      rooms.set(roomId, room);
      socket.join(roomId);
      socket.data.onlineRoomId = roomId;
      socket.data.onlinePlayerKey = playerKey;
      reply({ ok: true, room: serializeRoom(room) });
    });

    socket.on("online:join", (payload = {}, reply = () => {}) => {
      const roomId = String(payload.roomId || "").trim().toUpperCase();
      const room = rooms.get(roomId);

      if (!room) {
        reply({ ok: false, error: t(payload.language, "online.notFound") });
        return;
      }
      if (room.players.size >= MAX_ROOM_PLAYERS) {
        const playerKey = normalizePlayerKey(payload.playerKey, socket.id);
        if (room.players.has(playerKey)) {
          reconnectPlayer(io, disconnectTimers, socket, room, playerKey, payload.name, payload.language);
          reply({ ok: true, room: serializeRoom(room) });
          return;
        }
        reply({ ok: false, error: t(payload.language, "online.full") });
        return;
      }

      leaveRoom(io, rooms, disconnectTimers, socket);
      const playerKey = normalizePlayerKey(payload.playerKey, socket.id);
      reconnectPlayer(io, disconnectTimers, socket, room, playerKey, payload.name, payload.language);
      const state = serializeRoom(room);
      reply({ ok: true, room: state });
      io.to(roomId).emit("online:room-state", state);
    });

    socket.on("online:leave", (reply = () => {}) => {
      leaveRoom(io, rooms, disconnectTimers, socket);
      reply({ ok: true });
    });

    socket.on("disconnect", () => {
      const playerKey = socket.data.onlinePlayerKey;
      if (!playerKey) return;
      clearTimeout(disconnectTimers.get(playerKey));
      disconnectTimers.set(playerKey, setTimeout(() => {
        leaveRoom(io, rooms, disconnectTimers, socket);
      }, 2 * 60 * 1000));
    });
  });
}

function leaveRoom(io, rooms, disconnectTimers, socket) {
  const roomId = socket.data.onlineRoomId;
  if (!roomId) return;

  const room = rooms.get(roomId);
  const playerKey = socket.data.onlinePlayerKey;
  socket.data.onlineRoomId = null;
  socket.data.onlinePlayerKey = null;
  socket.leave(roomId);
  clearTimeout(disconnectTimers.get(playerKey));
  disconnectTimers.delete(playerKey);
  if (!room) return;

  room.players.delete(playerKey);
  if (!room.players.size) {
    rooms.delete(roomId);
    return;
  }

  if (room.hostId === playerKey) {
    room.hostId = room.players.keys().next().value;
  }
  io.to(roomId).emit("online:room-state", serializeRoom(room));
}

function serializeRoom(room) {
  return {
    id: room.id,
    maxPlayers: MAX_ROOM_PLAYERS,
    players: [...room.players.values()].map((player) => ({
      id: player.id,
      name: player.name,
      isHost: player.id === room.hostId
    }))
  };
}

function reconnectPlayer(io, disconnectTimers, socket, room, playerKey, name, language) {
  clearTimeout(disconnectTimers.get(playerKey));
  disconnectTimers.delete(playerKey);
  room.players.set(playerKey, {
    id: playerKey,
    socketId: socket.id,
    name: normalizeName(name, language)
  });
  socket.join(room.id);
  socket.data.onlineRoomId = room.id;
  socket.data.onlinePlayerKey = playerKey;
  io.to(room.id).emit("online:room-state", serializeRoom(room));
}

function createRoomId(rooms) {
  let id;
  do {
    id = Array.from(
      { length: 6 },
      () => ROOM_ALPHABET[crypto.randomInt(ROOM_ALPHABET.length)]
    ).join("");
  } while (rooms.has(id));
  return id;
}

function normalizeName(value, language = "vi") {
  const fallback = t(language, "common.farmer");
  return String(value || fallback).trim().slice(0, 30) || fallback;
}

function normalizePlayerKey(value, fallback) {
  const key = String(value || "").replace(/[^a-zA-Z0-9-]/g, "").slice(0, 64);
  return key || fallback;
}
