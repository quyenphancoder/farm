# Mô hình cơ sở dữ liệu Sunny Farm (Tiếng Việt)

English version: [DATABASE_ERD.md](./DATABASE_ERD.md)

```mermaid
erDiagram
    USERS ||--|| PLAYERS : "cùng id (quan hệ logic, chưa có FK)"
    USERS ||--o{ SESSIONS : "đăng nhập qua"
    PLAYERS ||--o{ INVENTORY : "sở hữu"
    PLAYERS ||--o{ FARM_STATE : "canh tác"
    PLAYERS ||--o{ UNLOCKED_PLOTS : "mở khóa"

    USERS {
        INTEGER id PK "AUTOINCREMENT"
        TEXT username UK "NOT NULL, COLLATE NOCASE"
        TEXT password_hash "NOT NULL"
        TEXT password_salt "NOT NULL"
        TEXT display_name "NOT NULL"
        TEXT created_at "NOT NULL, CURRENT_TIMESTAMP"
    }

    PLAYERS {
        INTEGER id PK "bằng users.id trong code"
        TEXT name "NOT NULL"
        INTEGER coins "NOT NULL, mặc định 500"
        INTEGER diamonds "NOT NULL, mặc định 200"
        INTEGER level "NOT NULL, mặc định 1"
        INTEGER xp "NOT NULL, mặc định 0"
        INTEGER unlocked_rows "NOT NULL, trường cũ"
        INTEGER water_started_at "epoch milliseconds, có thể NULL"
        INTEGER is_initialized "0 hoặc 1"
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
        TEXT item PK "mã vật phẩm"
        INTEGER quantity "NOT NULL, mặc định 0"
    }

    FARM_STATE {
        INTEGER player_id PK, FK
        INTEGER plot_id PK "0 đến 39"
        TEXT crop "carrot hoặc corn"
        INTEGER planted_at "epoch milliseconds"
        INTEGER watered_at "epoch milliseconds, có thể NULL"
        INTEGER treated_at "epoch milliseconds, có thể NULL"
    }

    UNLOCKED_PLOTS {
        INTEGER player_id PK, FK
        INTEGER plot_id PK "0 đến 39"
    }
```

## Ràng buộc thực tế

- `sessions.user_id → users.id`: foreign key thật, `ON DELETE CASCADE`.
- `inventory.player_id → players.id`: foreign key thật, khóa chính ghép `(player_id, item)`.
- `farm_state.player_id → players.id`: foreign key thật, khóa chính ghép `(player_id, plot_id)`.
- `unlocked_plots.player_id → players.id`: foreign key thật, khóa chính ghép `(player_id, plot_id)`.
- `players.id = users.id`: ứng dụng luôn tạo hai bản ghi cùng ID, nhưng schema hiện chưa khai báo foreign key.

## Giá trị nghiệp vụ chính

- `inventory.item`: `carrot_seed`, `corn_seed`, `pesticide`, `water`, `carrot`, `corn`.
- `farm_state` lưu một cây đang trồng trên mỗi ô đất; thu hoạch xong thì bản ghi bị xóa.
- `unlocked_plots` lưu riêng danh sách ô đất người chơi đã mở.
- Các trường thời gian gameplay dùng Unix epoch theo milliseconds; `created_at` dùng chuỗi thời gian của SQLite.
- `PRAGMA user_version = 1` đánh dấu migration lưới đất cũ từ 5 cột sang 8 cột.

## Dữ liệu không nằm trong database

Phòng chờ và trạng thái Online Battle hiện được giữ trong các `Map` tại `backend/realtime.js`. Khi server khởi động lại, toàn bộ phòng, trạng thái sẵn sàng và tiến độ trận đấu sẽ mất.
