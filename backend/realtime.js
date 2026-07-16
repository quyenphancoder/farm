import crypto from "node:crypto";
import { t } from "./i18n.js";

// Online rooms and battles are intentionally stored in server memory.
const MAX_ROOM_PLAYERS = 8;
const WIN_CARROT_COUNT = 3;
const RESULT_DURATION_MS = 5000;
const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function registerOnlineRooms(io) {
  const rooms = new Map();

  io.on("connection", (socket) => {
    socket.emit("online:room-list", serializeRoomList(rooms));

    socket.on("online:create", (payload = {}, reply = () => {}) => {
      leaveRoom(io, rooms, socket);

      const roomId = createRoomId(rooms);
      const playerKey = String(socket.data.user.id);
      const room = {
        id: roomId,
        listingId: crypto.randomUUID(),
        hostId: playerKey,
        isPrivate: Boolean(payload.isPrivate),
        phase: "lobby",
        readyPlayers: new Set(),
        players: new Map(),
        battle: null,
        resetTimer: null
      };
      room.players.set(playerKey, createPlayer(socket));
      rooms.set(roomId, room);
      joinSocketRoom(socket, room, playerKey);
      reply({ ok: true, room: serializeRoom(room) });
      emitRoomList(io, rooms);
    });

    socket.on("online:list", (reply = () => {}) => {
      reply({ ok: true, rooms: serializeRoomList(rooms) });
    });

    socket.on("online:join", (payload = {}, reply = () => {}) => {
      const roomId = String(payload.roomId || "").trim().toUpperCase();
      const listingId = String(payload.listingId || "");
      const room = listingId
        ? [...rooms.values()].find((candidate) => candidate.listingId === listingId)
        : rooms.get(roomId);

      if (!room) {
        reply({ ok: false, error: t(payload.language, "online.notFound") });
        return;
      }
      if (listingId) {
        const roomCode = String(payload.roomCode || "").trim().toUpperCase();
        if (!room.isPrivate || room.id !== roomCode) {
          reply({ ok: false, error: t(payload.language, "online.invalidCode") });
          return;
        }
      }

      const playerKey = String(socket.data.user.id);
      if (room.phase !== "lobby" && !room.players.has(playerKey)) {
        reply({ ok: false, error: t(payload.language, "online.inProgress") });
        return;
      }
      if (room.players.size >= MAX_ROOM_PLAYERS && !room.players.has(playerKey)) {
        reply({ ok: false, error: t(payload.language, "online.full") });
        return;
      }

      leaveRoom(io, rooms, socket);
      room.players.set(playerKey, createPlayer(socket));
      joinSocketRoom(socket, room, playerKey);
      const state = serializeRoom(room);
      reply({ ok: true, room: state });
      io.to(room.id).emit("online:room-state", state);
      emitRoomList(io, rooms);
    });

    socket.on("online:ready", (payload = {}, reply = () => {}) => {
      const room = rooms.get(socket.data.onlineRoomId);
      const playerKey = socket.data.onlinePlayerKey;
      if (!room || room.phase !== "lobby" || !room.players.has(playerKey)) {
        reply({ ok: false });
        return;
      }

      if (payload.ready) room.readyPlayers.add(playerKey);
      else room.readyPlayers.delete(playerKey);
      const state = serializeRoom(room);
      io.to(room.id).emit("online:room-state", state);
      reply({ ok: true, room: state });
    });

    socket.on("online:start", (payload = {}, reply = () => {}) => {
      const room = rooms.get(socket.data.onlineRoomId);
      const playerKey = socket.data.onlinePlayerKey;
      if (!room || room.phase !== "lobby" || room.hostId !== playerKey) {
        reply({ ok: false, error: t(payload.language, "online.hostOnly") });
        return;
      }
      if (!canStart(room)) {
        reply({ ok: false, error: t(payload.language, "online.everyoneReady") });
        return;
      }

      room.phase = "battle";
      room.battle = {
        progress: new Map([...room.players.keys()].map((id) => [id, 0])),
        plantedPlots: new Map([...room.players.keys()].map((id) => [id, new Set()])),
        harvestedPlots: new Map([...room.players.keys()].map((id) => [id, new Set()])),
        usedPlots: new Map([...room.players.keys()].map((id) => [id, new Set()])),
        winnerId: null
      };
      const state = serializeRoom(room);
      io.to(room.id).emit("online:battle-start", state);
      io.to(room.id).emit("online:room-state", state);
      emitRoomList(io, rooms);
      reply({ ok: true });
    });

    socket.on("online:plant", (payload = {}, reply = () => {}) => {
      const room = rooms.get(socket.data.onlineRoomId);
      const playerKey = socket.data.onlinePlayerKey;
      const plotId = Number(payload.plotId);
      if (
        !room
        || room.phase !== "battle"
        || !room.battle
        || !room.players.has(playerKey)
        || payload.crop !== "carrot"
        || !Number.isInteger(plotId)
        || plotId < 0
        || plotId >= 10
      ) {
        reply({ ok: false });
        return;
      }

      const plantedPlots = room.battle.plantedPlots.get(playerKey);
      const usedPlots = room.battle.usedPlots.get(playerKey);
      if (usedPlots.has(plotId)) {
        reply({ ok: false });
        return;
      }
      plantedPlots.add(plotId);
      usedPlots.add(plotId);
      reply({ ok: true });
    });

    socket.on("online:harvest", (payload = {}, reply = () => {}) => {
      const room = rooms.get(socket.data.onlineRoomId);
      const playerKey = socket.data.onlinePlayerKey;
      const plotId = Number(payload.plotId);
      if (
        !room
        || room.phase !== "battle"
        || !room.battle
        || !room.players.has(playerKey)
        || !Number.isInteger(plotId)
      ) {
        reply({ ok: false });
        return;
      }

      const plantedPlots = room.battle.plantedPlots.get(playerKey);
      const harvestedPlots = room.battle.harvestedPlots.get(playerKey);
      if (!plantedPlots.has(plotId) || harvestedPlots.has(plotId)) {
        reply({ ok: false });
        return;
      }
      plantedPlots.delete(plotId);
      harvestedPlots.add(plotId);
      const progress = Math.min(WIN_CARROT_COUNT, harvestedPlots.size);
      room.battle.progress.set(playerKey, progress);
      io.to(room.id).emit("online:battle-state", serializeBattle(room));
      reply({ ok: true, progress });

      if (progress >= WIN_CARROT_COUNT) finishBattle(io, rooms, room, playerKey);
    });

    socket.on("online:leave", (reply = () => {}) => {
      leaveRoom(io, rooms, socket);
      reply({ ok: true });
    });

    socket.on("disconnect", () => {
      leaveRoom(io, rooms, socket);
    });
  });
}

function createPlayer(socket) {
  return {
    id: String(socket.data.user.id),
    socketId: socket.id,
    name: socket.data.user.display_name
  };
}

function joinSocketRoom(socket, room, playerKey) {
  socket.join(room.id);
  socket.data.onlineRoomId = room.id;
  socket.data.onlinePlayerKey = playerKey;
}

function leaveRoom(io, rooms, socket) {
  const roomId = socket.data.onlineRoomId;
  if (!roomId) return;

  const room = rooms.get(roomId);
  const playerKey = socket.data.onlinePlayerKey;
  socket.data.onlineRoomId = null;
  socket.data.onlinePlayerKey = null;
  socket.leave(roomId);
  if (!room) return;

  room.players.delete(playerKey);
  room.readyPlayers.delete(playerKey);
  room.battle?.progress.delete(playerKey);
  room.battle?.plantedPlots.delete(playerKey);
  room.battle?.harvestedPlots.delete(playerKey);
  room.battle?.usedPlots.delete(playerKey);
  if (!room.players.size) {
    clearTimeout(room.resetTimer);
    rooms.delete(roomId);
    emitRoomList(io, rooms);
    return;
  }

  if (room.hostId === playerKey) room.hostId = room.players.keys().next().value;
  if (room.phase === "battle" && room.players.size === 1 && !room.battle.winnerId) {
    finishBattle(io, rooms, room, room.players.keys().next().value);
    return;
  }
  io.to(room.id).emit("online:room-state", serializeRoom(room));
  emitRoomList(io, rooms);
}

function finishBattle(io, rooms, room, winnerId) {
  if (room.phase !== "battle" || room.battle?.winnerId) return;
  room.phase = "results";
  room.battle.winnerId = winnerId;
  io.to(room.id).emit("online:battle-result", {
    ...serializeBattle(room),
    returnAt: Date.now() + RESULT_DURATION_MS
  });
  clearTimeout(room.resetTimer);
  room.resetTimer = setTimeout(() => {
    if (!rooms.has(room.id) || room.phase !== "results") return;
    room.phase = "lobby";
    room.readyPlayers.clear();
    room.battle = null;
    const state = serializeRoom(room);
    io.to(room.id).emit("online:room-state", state);
    io.to(room.id).emit("online:lobby", state);
    emitRoomList(io, rooms);
  }, RESULT_DURATION_MS);
}

function canStart(room) {
  return room.players.size >= 2
    && [...room.players.keys()].every((id) => room.readyPlayers.has(id));
}

function serializeRoom(room) {
  return {
    id: room.id,
    isPrivate: room.isPrivate,
    phase: room.phase,
    maxPlayers: MAX_ROOM_PLAYERS,
    canStart: canStart(room),
    players: [...room.players.values()].map((player) => ({
      id: player.id,
      name: player.name,
      isHost: player.id === room.hostId,
      isReady: room.readyPlayers.has(player.id),
      progress: room.battle?.progress.get(player.id) || 0
    }))
  };
}

function serializeBattle(room) {
  return {
    roomId: room.id,
    target: WIN_CARROT_COUNT,
    winnerId: room.battle?.winnerId || null,
    players: [...room.players.values()].map((player) => ({
      id: player.id,
      name: player.name,
      progress: room.battle?.progress.get(player.id) || 0
    }))
  };
}

function serializeRoomList(rooms) {
  return [...rooms.values()]
    .filter((room) => room.phase === "lobby")
    .map((room) => {
      const host = room.players.get(room.hostId);
      return {
        id: room.isPrivate ? null : room.id,
        listingId: room.listingId,
        hostName: host?.name || "",
        isPrivate: room.isPrivate,
        playerCount: room.players.size,
        maxPlayers: MAX_ROOM_PLAYERS
      };
    })
    .sort((left, right) => {
      if (left.isPrivate !== right.isPrivate) return Number(left.isPrivate) - Number(right.isPrivate);
      return right.playerCount - left.playerCount;
    });
}

function emitRoomList(io, rooms) {
  io.emit("online:room-list", serializeRoomList(rooms));
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
