# Sunny Farm — Presentation Summary

## 1. Introduction

**Sunny Farm** is a browser-based farming game. Players can control a character, grow and harvest crops, manage resources, and expand their farmland.

The project aims to combine simple gameplay, a friendly interface, and a foundation that can later support online competition.

## 2. Core Gameplay

- Move with `WASD`, the arrow keys, or the right mouse button.
- On mobile devices, tap the ground to move.
- Left-click or tap a plot to interact with it.
- Plant seeds, wait for crops to grow, and harvest them.
- Purchase seeds from the shop.
- Spend diamonds to unlock more plots.
- View coins, diamonds, inventory, and missions.
- Choose between **Continue**, **Restart**, and **Online Battle**.

## 3. Technology Stack

| Component | Technology | Purpose |
|---|---|---|
| Game engine | Phaser 3 | Map rendering, character movement, physics, and interaction |
| Backend | Node.js + Express | API processing and website hosting |
| Database | SQLite | Player, resource, and farm-state persistence |
| Dynamic UI | HTMX | HUD, shop, inventory, and mission updates |
| Real-time communication | Socket.IO | Online room creation and joining |
| Interface | HTML + CSS | Menus, popups, and responsive layouts |

## 4. High-Level Architecture

```text
Player
  │
  ├── Phaser ───── Character control and gameplay
  ├── HTMX ─────── UI and data updates
  └── Socket.IO ── Online lobby
           │
      Express Server
           │
         SQLite
```

The server validates actions such as purchasing items, planting crops, harvesting, and unlocking land. Important game data is stored in SQLite instead of existing only in the browser.

## 5. Key Features

- Runs directly in a web browser with no installation required.
- Uses a full-screen camera that follows the player like a top-down adventure game.
- Adapts to desktop, widescreen, and mobile displays.
- Saves farm progress for future sessions.
- Restarting removes the previous progress and creates a new character.
- Online rooms use six-character codes and support up to eight players.
- Socket.IO supports recovery after temporary connection loss.

## 6. Suggested Demo Flow

1. Open the game and introduce the three starting options.
2. Select **Continue** to enter the farm.
3. Move the character with the keyboard or right mouse button.
4. Plant a seed and harvest the crop.
5. Open the shop and purchase more seeds.
6. Show the inventory and mission list.
7. Unlock a locked plot.
8. Reload the page to demonstrate persistent data.
9. Return to online mode, create a room, and join it from another browser tab.

## 7. Online Mode

The project currently includes the online lobby foundation:

- Create a new room.
- Generate a room code automatically.
- Join a room by entering its code.
- Display the player list.
- Transfer room ownership when the host leaves.
- Recover from temporary disconnections.

The planned competitive mode gives every player a separate farm but the same mission list. The first player or team to complete every mission wins.

## 8. Future Development

- Add accounts and separate data for every player.
- Complete the solo online competition mode.
- Add `4 vs 4` and `8 vs 8` team modes.
- Display mission progress in real time.
- Add rankings and match history.
- Introduce more crops, items, and maps.
- Add sound effects, animations, and a new-player tutorial.

## 9. Current Limitations

- Competitive online gameplay is not yet connected to the mission system.
- The backend still mainly uses one sample player.
- The current shop and crop selection are limited.
- Account and matchmaking systems have not been implemented.

## 10. Conclusion

Sunny Farm already provides a complete basic gameplay loop, persistent data, responsive presentation, and an online lobby foundation. Its architecture allows the project to grow from a solo farming game into a multiplayer mission-racing experience.

> Main message: **A simple and accessible browser farming game with the potential to become an online competitive experience.**

