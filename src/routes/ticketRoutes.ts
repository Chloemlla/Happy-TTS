import express from "express";
import { ticketController } from "../controllers/ticketController";
import { authenticateToken } from "../middleware/authenticateToken";

const router = express.Router();

// 所有工单接口都需要登录
router.use(authenticateToken);

// 用户接口
router.post("/", ticketController.createTicket);
router.get("/", ticketController.getUserTickets);
router.get("/:id", ticketController.getTicketById);
router.post("/:id/messages", ticketController.replyToTicket);

// 管理员接口 (在 controller 内部已有角色检查，但为了安全建议在此处也加上)
const adminOnly = (req: any, res: any, next: any) => {
  if (req.user && req.user.role === "admin") {
    next();
  } else {
    res.status(403).json({ error: "需要管理员权限" });
  }
};

router.get("/admin/all", adminOnly, ticketController.getAllTickets);
router.patch("/admin/:id/status", adminOnly, ticketController.updateTicketStatus);
router.put("/admin/:id/messages/:messageIndex", adminOnly, ticketController.adminEditMessage);
router.delete("/admin/:id/messages/:messageIndex", adminOnly, ticketController.adminDeleteMessage);

export default router;
