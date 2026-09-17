import express from "express";

const router = express.Router();

router.use("/classes", classesRouter);

export default router;
