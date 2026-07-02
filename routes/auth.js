import { Router } from "express";

const router = Router();

router.post("/login", (req, res) => {
  const name = String(req.body.name || "Nông dân").trim().slice(0, 30);
  req.app.locals.db.prepare("UPDATE players SET name = ? WHERE id = 1").run(name);
  res.send(`<span class="text-emerald-300">Xin chào, ${escapeHtml(name)}!</span>`);
});

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[char]);
}

export default router;
