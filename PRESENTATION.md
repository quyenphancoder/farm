# Sunny Farm — Tóm tắt thuyết trình

## 1. Giới thiệu

**Sunny Farm** là game nông trại chạy trực tiếp trên trình duyệt. Người chơi điều khiển nhân vật, gieo trồng, thu hoạch, quản lý tài nguyên và mở rộng đất.

Mục tiêu của dự án là kết hợp gameplay đơn giản, giao diện thân thiện và nền tảng có thể phát triển thành chế độ thi đấu online.

## 2. Gameplay chính

- Di chuyển bằng `WASD`, phím mũi tên hoặc chuột phải.
- Trên điện thoại, người chơi chạm vào mặt đất để di chuyển.
- Nhấn chuột trái hoặc chạm vào ô đất để tương tác.
- Gieo hạt, chờ cây trưởng thành và thu hoạch.
- Mua hạt giống trong cửa hàng.
- Dùng kim cương để mở thêm ô đất.
- Theo dõi vàng, kim cương, kho đồ và nhiệm vụ.
- Có lựa chọn **Chơi tiếp**, **Chơi lại** hoặc **Đấu online**.

## 3. Công nghệ sử dụng

| Thành phần | Công nghệ | Vai trò |
|---|---|---|
| Game engine | Phaser 3 | Hiển thị bản đồ, nhân vật, vật lý và tương tác |
| Backend | Node.js + Express | Xử lý API và phục vụ website |
| Database | SQLite | Lưu người chơi, tài nguyên và trạng thái nông trại |
| Giao diện động | HTMX | Cập nhật HUD, cửa hàng, kho đồ và nhiệm vụ |
| Realtime | Socket.IO | Tạo phòng và tham gia phòng online |
| Giao diện | HTML + CSS | Menu, popup và responsive đa thiết bị |

## 4. Kiến trúc tổng quát

```text
Người chơi
    │
    ├── Phaser ── Điều khiển nhân vật và gameplay
    ├── HTMX ──── Cập nhật giao diện và dữ liệu
    └── Socket.IO ── Phòng chờ online
             │
        Express Server
             │
           SQLite
```

Server là nơi kiểm tra các hành động như mua vật phẩm, gieo cây, thu hoạch và mở đất. Dữ liệu quan trọng không chỉ được lưu ở trình duyệt mà được lưu trong SQLite.

## 5. Những điểm nổi bật

- Game chạy ngay trên website, không cần cài đặt.
- Camera phủ kín màn hình và di chuyển theo nhân vật như game đi cảnh góc nhìn top-down.
- Giao diện thích ứng với desktop, màn hình rộng và điện thoại.
- Dữ liệu nông trại được lưu lại để tiếp tục chơi.
- Chơi lại sẽ xoá tiến trình cũ và tạo nhân vật mới.
- Phòng online sử dụng mã gồm 6 ký tự, hỗ trợ tối đa 8 người.
- Socket.IO hỗ trợ kết nối lại khi mạng bị gián đoạn tạm thời.

## 6. Kịch bản demo đề xuất

1. Mở game và giới thiệu ba chế độ ở màn hình bắt đầu.
2. Chọn **Chơi tiếp** để vào nông trại.
3. Di chuyển nhân vật bằng bàn phím hoặc chuột phải.
4. Gieo một hạt giống và thu hoạch cây.
5. Mở cửa hàng, mua thêm hạt giống.
6. Mở kho đồ và danh sách nhiệm vụ.
7. Thử mua một ô đất đang bị khoá.
8. Tải lại trang để chứng minh dữ liệu vẫn được lưu.
9. Quay lại chế độ online, tạo phòng và dùng tab khác nhập mã phòng.

## 7. Chế độ online

Hiện tại dự án đã có nền tảng phòng chờ:

- Tạo phòng mới.
- Sinh mã phòng tự động.
- Nhập mã để tham gia.
- Hiển thị danh sách người chơi.
- Chuyển chủ phòng khi chủ cũ rời đi.
- Hỗ trợ kết nối lại.

Phần gameplay đối kháng sẽ được phát triển theo mô hình mỗi người chơi thao tác trên nông trại riêng nhưng cùng nhận một danh sách nhiệm vụ. Người hoặc đội hoàn thành danh sách sớm nhất sẽ chiến thắng.

## 8. Hướng phát triển

- Tạo tài khoản và dữ liệu riêng cho từng người chơi.
- Hoàn thiện trận đấu solo online.
- Thêm chế độ đội `4 vs 4` và `8 vs 8`.
- Bảng tiến độ nhiệm vụ theo thời gian thực.
- Hệ thống xếp hạng và lịch sử trận đấu.
- Thêm cây trồng, vật phẩm và bản đồ mới.
- Bổ sung âm thanh, hiệu ứng và hướng dẫn người chơi mới.

## 9. Hạn chế hiện tại

- Gameplay thi đấu online chưa được nối với hệ thống nhiệm vụ.
- Backend hiện vẫn chủ yếu sử dụng một người chơi mẫu.
- Nội dung cây trồng và cửa hàng còn ít.
- Chưa có hệ thống tài khoản và matchmaking.

## 10. Kết luận

Sunny Farm đã hoàn thiện vòng lặp gameplay cơ bản, lưu dữ liệu, giao diện responsive và nền tảng phòng online. Kiến trúc hiện tại cho phép dự án tiếp tục mở rộng từ game nông trại solo thành game đua nhiệm vụ nhiều người chơi.

> Thông điệp chính: **Một game nông trại đơn giản trên trình duyệt, dễ tiếp cận và có khả năng phát triển thành trải nghiệm thi đấu online.**

