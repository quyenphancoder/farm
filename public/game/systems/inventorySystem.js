export default class InventorySystem {
  async fetchState() {
    const response = await fetch("/api/game/state");
    if (!response.ok) throw new Error("Không tải được dữ liệu nông trại.");
    return response.json();
  }

  async request(url, body = null) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined
      });
      return await response.json();
    } catch {
      return { error: "Không thể kết nối máy chủ." };
    }
  }
}
