import { Router } from "express";
import { logoutHandler } from "../controllers/authController";

const router = Router();

router.post("/", logoutHandler);

export default router;

