import { api } from "./api";

export interface ITicketMessage {
  senderId: string;
  senderRole: "user" | "admin";
  content: string;
  createdAt: string;
}

export interface ITicket {
  _id: string;
  userId: string;
  username: string;
  title: string;
  description: string;
  status: "open" | "in-progress" | "resolved" | "closed";
  priority: "low" | "medium" | "high";
  messages: ITicketMessage[];
  createdAt: string;
  updatedAt: string;
}

export const ticketApi = {
  // 用户获取自己的工单
  async getMyTickets(): Promise<ITicket[]> {
    const response = await api.get("/api/tickets");
    return response.data;
  },

  // 用户创建工单
  async createTicket(data: {
    title: string;
    description: string;
    priority?: string;
  }): Promise<ITicket> {
    const response = await api.post("/api/tickets", data);
    return response.data;
  },

  // 获取工单详情
  async getTicket(id: string): Promise<ITicket> {
    const response = await api.get(`/api/tickets/${id}`);
    return response.data;
  },

  // 回复工单
  async replyTicket(id: string, content: string): Promise<ITicket> {
    const response = await api.post(`/api/tickets/${id}/messages`, { content });
    return response.data;
  },

  // 管理员获取所有工单
  async getAllTickets(params?: {
    status?: string;
    priority?: string;
  }): Promise<ITicket[]> {
    const response = await api.get("/api/tickets/admin/all", { params });
    return response.data;
  },

  // 管理员更新状态
  async updateStatus(id: string, status: string): Promise<ITicket> {
    const response = await api.patch(`/api/tickets/admin/${id}/status`, { status });
    return response.data;
  },
};
