import type { Request, Response } from "express";
import { TicketModel } from "../models/ticketModel";
import logger from "../utils/logger";

export const ticketController = {
  // 用户创建工单
  async createTicket(req: Request, res: Response) {
    try {
      const { title, description, priority } = req.body;
      const user = (req as any).user;

      if (!title || !description) {
        return res.status(400).json({ error: "标题和描述不能为空" });
      }

      const newTicket = new TicketModel({
        userId: user.id,
        username: user.username,
        title,
        description,
        priority: priority || "medium",
        messages: [
          {
            senderId: user.id,
            senderRole: "user",
            content: description,
          },
        ],
      });

      await newTicket.save();
      res.status(201).json(newTicket);
    } catch (error) {
      logger.error("创建工单失败:", error);
      res.status(500).json({ error: "服务器内部错误" });
    }
  },

  // 用户获取自己的工单列表
  async getUserTickets(req: Request, res: Response) {
    try {
      const user = (req as any).user;
      const tickets = await TicketModel.find({ userId: user.id }).sort({
        updatedAt: -1,
      });
      res.json(tickets);
    } catch (error) {
      logger.error("获取工单列表失败:", error);
      res.status(500).json({ error: "服务器内部错误" });
    }
  },

  // 获取单个工单详情
  async getTicketById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const user = (req as any).user;

      const ticket = await TicketModel.findById(id);
      if (!ticket) {
        return res.status(404).json({ error: "工单不存在" });
      }

      // 权限检查：只有工单所有者或管理员可以查看
      if (ticket.userId !== user.id && user.role !== "admin") {
        return res.status(403).json({ error: "无权访问此工单" });
      }

      res.json(ticket);
    } catch (error) {
      logger.error("获取工单详情失败:", error);
      res.status(500).json({ error: "服务器内部错误" });
    }
  },

  // 回复工单 (用户或管理员)
  async replyToTicket(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { content } = req.body;
      const user = (req as any).user;

      if (!content) {
        return res.status(400).json({ error: "回复内容不能为空" });
      }

      const ticket = await TicketModel.findById(id);
      if (!ticket) {
        return res.status(404).json({ error: "工单不存在" });
      }

      // 权限检查
      if (ticket.userId !== user.id && user.role !== "admin") {
        return res.status(403).json({ error: "无权回复此工单" });
      }

      // 添加消息
      ticket.messages.push({
        senderId: user.id,
        senderRole: user.role === "admin" ? "admin" : "user",
        content,
        createdAt: new Date(),
      });

      // 如果是管理员回复，自动将状态改为 in-progress (如果当前是 open)
      if (user.role === "admin" && ticket.status === "open") {
        ticket.status = "in-progress";
      }

      await ticket.save();
      res.json(ticket);
    } catch (error) {
      logger.error("回复工单失败:", error);
      res.status(500).json({ error: "服务器内部错误" });
    }
  },

  // 管理员获取所有工单
  async getAllTickets(req: Request, res: Response) {
    try {
      const { status, priority } = req.query;
      const query: any = {};
      if (status) query.status = status;
      if (priority) query.priority = priority;

      const tickets = await TicketModel.find(query).sort({ updatedAt: -1 });
      res.json(tickets);
    } catch (error) {
      logger.error("管理员获取工单列表失败:", error);
      res.status(500).json({ error: "服务器内部错误" });
    }
  },

  // 管理员更新工单状态
  async updateTicketStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!["open", "in-progress", "resolved", "closed"].includes(status)) {
        return res.status(400).json({ error: "无效的状态" });
      }

      const ticket = await TicketModel.findByIdAndUpdate(
        id,
        { status },
        { new: true }
      );

      if (!ticket) {
        return res.status(404).json({ error: "工单不存在" });
      }

      res.json(ticket);
    } catch (error) {
      logger.error("更新工单状态失败:", error);
      res.status(500).json({ error: "服务器内部错误" });
    }
  },
};
