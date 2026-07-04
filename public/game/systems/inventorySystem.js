export default class InventorySystem {
  async fetchState() {
    const response = await fetch("/api/game/state");
    if (!response.ok) throw new Error(window.i18n?.t("game.loadFailed") || "Unable to load farm data.");
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
      return { error: window.i18n?.t("game.serverFailed") || "Unable to connect to the server." };
    }
  }
}
