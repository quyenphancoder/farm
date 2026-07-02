import { Router } from "express";

const router = Router();

router.get("/stats", (req, res) => {
  const db = req.app.locals.db;
  res.json({
    players: db.prepare("SELECT COUNT(*) AS count FROM players").get().count,
    plantedPlots: db.prepare("SELECT COUNT(*) AS count FROM farm_state").get().count
  });
});

export default router;
