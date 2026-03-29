import type { Request, Response } from "express";
import { TicketModel, ITicket } from "../models/ticketModel";
import { UserStorage, User as UserType } from "../utils/userStorage";
import { EmailService, DEFAULT_EMAIL_FROM } from "../services/emailService";
import * as emailTemplates from "../templates/emailTemplates";
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

      // 异步发送邮件通知给管理员
      (async () => {
        try {
          const allUsers = await UserStorage.getAllUsers();
          const admins = allUsers.filter(u => u.role === "admin");
          const adminEmails = admins.map(a => a.email).filter(Boolean);
          
          if (adminEmails.length > 0) {
            const html = emailTemplates.generateTicketCreatedEmailHtml(
              "管理员", 
              user.username, 
              title, 
              priority || "medium", 
              new Date().toLocaleString()
            );
            await EmailService.sendBatchHtmlEmails(adminEmails, `[新工单] ${title}`, html);
          }
        } catch (err) {
          logger.error("发送新工单邮件通知失败:", err);
        }
      })();

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

      const ticket = await TicketModel.findById(id) as ITicket | null;
      if (!ticket) {
        return res.status(404).json({ error: "工单不存在" });
      }

      // 权限检查
      const isAdmin = user.role?.toLowerCase().trim() === "admin";
      if (ticket.userId !== user.id && !isAdmin) {
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
      const isAdmin = user.role?.toLowerCase().trim() === "admin";
      if (ticket.userId !== user.id && !isAdmin) {
        return res.status(403).json({ error: "无权回复此工单" });
      }

      // 添加消息
      const senderRole = isAdmin ? "admin" : "user";
      ticket.messages.push({
        senderId: user.id,
        senderRole,
        content,
        createdAt: new Date(),
      });

      // 如果是管理员回复，且当前是 open，自动改为 in-progress
      if (senderRole === "admin" && ticket.status === "open") {
        ticket.status = "in-progress";
      }

      await ticket.save();

      // 如果是管理员回复，异步发送邮件给工单发起者
      if (senderRole === "admin") {
        (async () => {
          try {
            const ticketUser = await UserStorage.getUserById(ticket.userId);
            if (ticketUser && ticketUser.email) {
              const html = emailTemplates.generateFeedbackRepliedEmailHtml(
                ticketUser.username,
                ticket.title,
                content,
                new Date().toLocaleString()
              );
              await EmailService.sendEmail({
                from: DEFAULT_EMAIL_FROM,
                to: [ticketUser.email],
                subject: `[回复] 您的工单「${ticket.title}」有了新回复`,
                html
              });
            }
          } catch (err) {
            logger.error("发送工单回复邮件通知失败:", err);
          }
        })();
      } else {
        // 如果是用户回复，通知管理员
        (async () => {
          try {
            const allUsers = await UserStorage.getAllUsers();
            const admins = allUsers.filter(u => u.role === "admin");
            const adminEmails = admins.map(a => a.email).filter(Boolean);
            if (adminEmails.length > 0) {
              const html = emailTemplates.generateFeedbackRepliedEmailHtml(
                "管理员",
                `[用户回复] ${ticket.title}`,
                content,
                new Date().toLocaleString()
              );
              await EmailService.sendBatchHtmlEmails(adminEmails, `[追加回复] ${ticket.title}`, html);
            }
          } catch (err) {
            logger.error("发送用户追加回复邮件通知失败:", err);
          }
        })();
      }

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
      if (typeof status === 'string' && status) query.status = status;
      if (typeof priority === 'string' && priority) query.priority = priority;

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

      // 异步发送状态变更通知给用户
      (async () => {
        try {
          const ticketUser = await UserStorage.getUserById(ticket.userId);
          if (ticketUser && ticketUser.email) {
            const html = emailTemplates.generateTicketStatusChangedEmailHtml(
              ticketUser.username,
              ticket.title,
              status,
              new Date().toLocaleString()
            );
            await EmailService.sendEmail({
              from: DEFAULT_EMAIL_FROM,
              to: [ticketUser.email],
              subject: `[状态更新] 您的工单「${ticket.title}」已更新为 ${status}`,
              html
            });
          }
        } catch (err) {
          logger.error("发送工单状态变更邮件通知失败:", err);
        }
      })();

      res.json(ticket);
    } catch (error) {
      logger.error("更新工单状态失败:", error);
      res.status(500).json({ error: "服务器内部错误" });
    }
  },
};
