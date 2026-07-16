# 🌱 Linh Điền Ký

Linh Điền Ký is a browser-based cultivation farming game. Players can control a character, grow and care for crops, harvest produce, manage resources, and expand their spirit fields.

The game supports two modes:

- **Solo:** progress is persisted in SQLite.
- **Online Battle:** players join a shared room and race to harvest three carrots first.

## Key features

- Register, log in, and create a character.
- Plant, water, care for, and harvest crops.
- Collect water from the well.
- Manage inventory, buy seeds, and sell produce.
- Unlock more plots and level up the character.
- Create or join Online Battle rooms with Socket.IO.
- Switch between Vietnamese and English.

## Technology

- **Frontend:** HTML, CSS, JavaScript, Phaser, and HTMX.
- **Backend:** Node.js, Express, and Socket.IO.
- **Database:** SQLite.

## Requirements

- Node.js 24.16.0 or later.
- npm.

## Installation

Clone or download the project, open a terminal in its root directory, and run:

```bash
nvm install 24.16.0
nvm use 24.16.0
```

If Node.js is already installed at the required version, continue with:

```bash
npm install
npm start
```

Open the game in your browser:

```text
http://localhost:3000
```

To run in development mode with automatic server restarts:

```bash
npm run dev
```

## Project structure

```text
backend/          Backend, APIs, and Online Battle logic
public/           UI, Phaser game code, locales, and assets
docs/             Documentation, database diagrams, and presentations
database.sqlite   Persistent Solo data
```

## Documentation

- [Database model](./docs/DATABASE_ERD.md)
- [Online Battle and Solo data comparison](./docs/ONLINE_VS_SOLO.md)
- [Presentation summary](./docs/PRESENTATION_EN.md)
