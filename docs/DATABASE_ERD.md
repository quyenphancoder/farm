# Sunny Farm Database Model

Vietnamese version: [DATABASE_ERD_VI.md](./DATABASE_ERD_VI.md)

```mermaid
erDiagram
    USERS ||--|| PLAYERS : "same id (logical relation, no FK)"
    USERS ||--o{ SESSIONS : "authenticates through"
    PLAYERS ||--o{ INVENTORY : "owns"
    PLAYERS ||--o{ FARM_STATE : "farms"
    PLAYERS ||--o{ UNLOCKED_PLOTS : "unlocks"

    USERS {
        INTEGER id PK "AUTOINCREMENT"
        TEXT username UK "NOT NULL, COLLATE NOCASE"
        TEXT password_hash "NOT NULL"
        TEXT password_salt "NOT NULL"
        TEXT display_name "NOT NULL"
        TEXT created_at "NOT NULL, CURRENT_TIMESTAMP"
    }

    PLAYERS {
        INTEGER id PK "equals users.id in application code"
        TEXT name "NOT NULL"
        INTEGER coins "NOT NULL, default 500"
        INTEGER diamonds "NOT NULL, default 200"
        INTEGER level "NOT NULL, default 1"
        INTEGER xp "NOT NULL, default 0"
        INTEGER unlocked_rows "NOT NULL, legacy field"
        INTEGER water_started_at "epoch milliseconds, nullable"
        INTEGER is_initialized "0 or 1"
        TEXT created_at "NOT NULL, CURRENT_TIMESTAMP"
    }

    SESSIONS {
        TEXT token_hash PK
        INTEGER user_id FK "NOT NULL"
        INTEGER expires_at "epoch milliseconds"
        TEXT created_at "NOT NULL, CURRENT_TIMESTAMP"
    }

    INVENTORY {
        INTEGER player_id PK, FK
        TEXT item PK "item code"
        INTEGER quantity "NOT NULL, default 0"
    }

    FARM_STATE {
        INTEGER player_id PK, FK
        INTEGER plot_id PK "0 through 39"
        TEXT crop "carrot or corn"
        INTEGER planted_at "epoch milliseconds"
        INTEGER watered_at "epoch milliseconds, nullable"
        INTEGER treated_at "epoch milliseconds, nullable"
    }

    UNLOCKED_PLOTS {
        INTEGER player_id PK, FK
        INTEGER plot_id PK "0 through 39"
    }
```

## Actual constraints

- `sessions.user_id → users.id`: declared foreign key with `ON DELETE CASCADE`.
- `inventory.player_id → players.id`: declared foreign key with composite primary key `(player_id, item)`.
- `farm_state.player_id → players.id`: declared foreign key with composite primary key `(player_id, plot_id)`.
- `unlocked_plots.player_id → players.id`: declared foreign key with composite primary key `(player_id, plot_id)`.
- `players.id = users.id`: the application creates both records with the same ID, but the schema does not currently declare this foreign key.

## Main domain values

- `inventory.item`: `carrot_seed`, `corn_seed`, `pesticide`, `water`, `carrot`, and `corn`.
- `farm_state` stores at most one growing crop per plot. Its row is deleted after harvesting.
- `unlocked_plots` stores the plots each player has unlocked.
- Gameplay timestamps use Unix epoch milliseconds; `created_at` uses SQLite timestamp text.
- `PRAGMA user_version = 1` marks the plot-grid migration from five columns to eight columns.

## Data outside the database

Online lobby and battle state are held in `Map` objects in `backend/realtime.js`. Restarting the server removes all rooms, ready states, and active battle progress.
