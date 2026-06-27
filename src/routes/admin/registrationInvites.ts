import express from "express";
import {
  createRegistrationInvite,
  deleteRegistrationInvite,
  listRegistrationInvites,
  updateRegistrationInvite,
} from "../../services/registrationInviteService";

const router = express.Router();

router.get("/registration-invites", async (_req, res) => {
  try {
    const invites = await listRegistrationInvites();
    return res.json({ success: true, invites });
  } catch (error) {
    return res.status(500).json({ error: "获取邀请码列表失败" });
  }
});

router.post("/registration-invites", async (req: any, res) => {
  try {
    const invite = await createRegistrationInvite(req.body || {}, {
      id: req.user?.id,
      username: req.user?.username,
    });
    return res.json({ success: true, invite });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "创建邀请码失败" });
  }
});

router.patch("/registration-invites/:id", async (req, res) => {
  try {
    const invite = await updateRegistrationInvite(req.params.id, req.body || {});
    if (!invite) {
      return res.status(404).json({ error: "邀请码不存在" });
    }
    return res.json({ success: true, invite });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "更新邀请码失败" });
  }
});

router.delete("/registration-invites/:id", async (req, res) => {
  try {
    const deleted = await deleteRegistrationInvite(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: "邀请码不存在" });
    }
    return res.json({ success: true });
  } catch (error) {
    return res.status(400).json({ error: "删除邀请码失败" });
  }
});

export default router;
