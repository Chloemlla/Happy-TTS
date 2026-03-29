import type { Request, Response } from "express";
import { mongoose } from "../services/mongoService";
import { TicketModel, ITicket } from "../models/ticketModel";
import { UserStorage } from "../utils/userStorage";
import { EmailService, DEFAULT_EMAIL_FROM } from "../services/emailService";
import * as emailTemplates from "../templates/emailTemplates";
import { libreChatService } from "../services/libreChatService";
import { ModerationService } from "../services/moderationService";
import axios from "axios";
import logger from "../utils/logger";

/**
 * 助手函数：生成 AI 回复并保存到工单
 */
async function generateAiTicketResponse(ticket: any) {
  try {
    const ticketId = ticket._id.toString();
    const lastMessage = ticket.messages[ticket.messages.length - 1];
    
    // 如果最后一条消息不是来自用户，或者已经是 AI 回复，则不再触发
    if (lastMessage.senderRole !== "user" || lastMessage.isAi) {
      return;
    }

    logger.info(`正在为工单「${ticket.title}」生成 AI 综合回复...`);

    // 构建 AI 提示词上下文
    const systemPrompt = `你是 Synapse 系统的智能客服支持助手。
你需要根据用户提供的工单信息提供综合性的排查方案和实际解决方案。
工单标题: ${ticket.title}
工单初始描述: ${ticket.description}
优先级: ${ticket.priority}

回复要求:
1. 提供详细的故障排查步骤。
2. 给出具体的、可操作的解决方案。
3. 如果问题涉及技术细节，请提供代码示例或配置说明。
4. 使用 Markdown 格式进行排版，确保结构清晰（使用标题、列表、代码块等）。
5. 语气要专业、耐心且有建设性。
6. 综合考虑当前所有的对话上下文进行回答。`;

    // 考虑到 libreChatService 已经处理了多 Provider 和权重，我们直接使用它，
    // 但通过一个独立的 "ticket_ai" 前缀 token 来隔离普通聊天历史。
    try {
      const aiResponse = await libreChatService.sendMessage(
        `ticket_context_${ticketId}`,
        `${systemPrompt}\n\n当前用户反馈: ${lastMessage.content}`,
        "system_ai_assistant",
        undefined,
        "admin" // 以管理员权限调用，跳过验证
      );

      if (aiResponse) {
        // 将 AI 回复添加到工单
        ticket.messages.push({
          senderId: "system_ai",
          senderRole: "ai",
          content: aiResponse,
          isAi: true,
          createdAt: new Date(),
        });

        // 如果工单状态是 open，改为 in-progress
        if (ticket.status === "open") {
          ticket.status = "in-progress";
        }

        await ticket.save();
        logger.info(`已成功为工单「${ticket.title}」添加 AI 回复`);
      }
    } catch (err) {
      logger.error("生成工单 AI 回复失败:", err);
    }
  } catch (error) {
    logger.error("generateAiTicketResponse 内部错误:", error);
  }
}

export const ticketController = {
  // 用户创建工单
  async createTicket(req: Request, res: Response) {
    try {
      const { title, description, priority } = req.body;
      const userObj = (req as any).user;

      // 1. 检查用户是否被封禁
      const banStatus = ModerationService.isUserBanned(userObj);
      if (banStatus.isBanned) {
        return res.status(403).json({ 
          error: "您的工单权限已被封禁", 
          details: `封禁剩余时间: ${banStatus.remainingTime}` 
        });
      }

      if (!title || !description) {
        return res.status(400).json({ error: "标题和描述不能为空" });
      }

      // 2. AI 审查标题和描述 (两步法)
      const isTitleViolated = await ModerationService.checkContentWithAi(title);
      const isDescViolated = await ModerationService.checkContentWithAi(description);

      if (isTitleViolated || isDescViolated) {
        // 如果违规，请求 AI 给出详细原因
        const titleReason = isTitleViolated ? await ModerationService.getAiViolationReason(title) : "";
        const descReason = isDescViolated ? await ModerationService.getAiViolationReason(description) : "";
        
        const punishment = await ModerationService.handleViolation(userObj);
        return res.status(403).json({ 
          error: "AI 审查判定违规", 
          details: `标题: ${titleReason || "合规"}\n描述: ${descReason || "合规"}`,
          punishment: punishment
        });
      }

      // 验证优先级
      const validPriorities = ["low", "medium", "high"];
      const ticketPriority = validPriorities.includes(priority) ? priority : "medium";

      const newTicket = new TicketModel({
        userId: userObj.id,
        username: userObj.username,
        title: String(title),
        description: String(description),
        priority: ticketPriority,
        messages: [
          {
            senderId: userObj.id,
            senderRole: "user",
            content: String(description),
            isAi: false,
          },
        ],
      });

      await newTicket.save();

      // 异步生成 AI 回复
      generateAiTicketResponse(newTicket).catch(err => logger.error("异步 AI 回复触发失败:", err));

      // 异步发送邮件通知给管理员
      (async () => {
        try {
          const allUsers = await UserStorage.getAllUsers();
          const admins = allUsers.filter(u => u.role === "admin");
          const adminEmails = admins.map(a => a.email).filter(Boolean);
          
          if (adminEmails.length > 0) {
            const html = emailTemplates.generateTicketCreatedEmailHtml(
              "管理员", 
              userObj.username, 
              String(title), 
              ticketPriority, 
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
      const tickets = await TicketModel.find({ userId: String(user.id) }).sort({
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

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ error: "无效的工单ID" });
      }

      const ticket = await TicketModel.findById(id) as ITicket | null;
      if (!ticket) {
        return res.status(404).json({ error: "工单不存在" });
      }

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
      const userObj = (req as any).user;

      if (!content) {
        return res.status(400).json({ error: "回复内容不能为空" });
      }

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ error: "无效的工单ID" });
      }

      const ticket = await TicketModel.findById(id);
      if (!ticket) {
        return res.status(404).json({ error: "工单不存在" });
      }

      const isAdmin = userObj.role?.toLowerCase().trim() === "admin";
      if (ticket.userId !== userObj.id && !isAdmin) {
        return res.status(403).json({ error: "无权回复此工单" });
      }

      // 1. 如果是用户，检查是否被封禁
      if (!isAdmin) {
        const banStatus = ModerationService.isUserBanned(userObj);
        if (banStatus.isBanned) {
          return res.status(403).json({ 
            error: "您的工单权限已被封禁", 
            details: `封禁剩余时间: ${banStatus.remainingTime}` 
          });
        }

        // 2. AI 审查回复内容 (两步法)
        const isViolated = await ModerationService.checkContentWithAi(content);
        if (isViolated) {
          const reason = await ModerationService.getAiViolationReason(content);
          const punishment = await ModerationService.handleViolation(userObj);
          return res.status(403).json({ 
            error: "AI 审查判定违规", 
            details: reason,
            punishment: punishment
          });
        }
      }

      // 添加消息
      const senderRole = isAdmin ? "admin" : "user";
      ticket.messages.push({
        senderId: userObj.id,
        senderRole,
        content: String(content),
        isAi: false,
        createdAt: new Date(),
      });

      if (senderRole === "admin" && ticket.status === "open") {
        ticket.status = "in-progress";
      }

      await ticket.save();

      // 如果是用户回复，异步触发 AI 回复
      if (!isAdmin) {
        generateAiTicketResponse(ticket).catch(err => logger.error("异步 AI 回复触发失败:", err));
      }

      // 邮件通知
      if (senderRole === "admin") {
        (async () => {
          try {
            const ticketUser = await UserStorage.getUserById(ticket.userId);
            if (ticketUser && ticketUser.email) {
              const html = emailTemplates.generateFeedbackRepliedEmailHtml(
                ticketUser.username,
                ticket.title,
                String(content),
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
        (async () => {
          try {
            const allUsers = await UserStorage.getAllUsers();
            const admins = allUsers.filter(u => u.role === "admin");
            const adminEmails = admins.map(a => a.email).filter(Boolean);
            if (adminEmails.length > 0) {
              const html = emailTemplates.generateFeedbackRepliedEmailHtml(
                "管理员",
                `[用户回复] ${ticket.title}`,
                String(content),
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
      const validStatuses = ["open", "in-progress", "resolved", "closed"];
      const validPriorities = ["low", "medium", "high"];

      if (typeof status === 'string' && validStatuses.includes(status)) {
        query.status = status;
      }
      if (typeof priority === 'string' && validPriorities.includes(priority)) {
        query.priority = priority;
      }

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

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ error: "无效的工单ID" });
      }

      const validStatuses = ["open", "in-progress", "resolved", "closed"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: "无效的状态值" });
      }

      const ticket = await TicketModel.findByIdAndUpdate(
        id,
        { $set: { status: String(status) } },
        { new: true }
      );

      if (!ticket) {
        return res.status(404).json({ error: "工单不存在" });
      }

      (async () => {
        try {
          const ticketUser = await UserStorage.getUserById(ticket.userId);
          if (ticketUser && ticketUser.email) {
            const html = emailTemplates.generateTicketStatusChangedEmailHtml(
              ticketUser.username,
              ticket.title,
              String(status),
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
