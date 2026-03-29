import { config } from "../config/config";

const API_BASE = `${config.apiBase}/tickets`;

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
    const response = await fetch(`${API_BASE}`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
    });
    if (!response.ok) throw new Error("获取工单列表失败");
    return response.json();
  },

  // 用户创建工单
  async createTicket(data: {
    title: string;
    description: string;
    priority?: string;
  }): Promise<ITicket> {
    const response = await fetch(`${API_BASE}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error("创建工单失败");
    return response.json();
  },

  // 获取工单详情
  async getTicket(id: string): Promise<ITicket> {
    const response = await fetch(`${API_BASE}/${id}`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
    });
    if (!response.ok) throw new Error("获取工单详情失败");
    return response.json();
  },

  // 回复工单
  async replyTicket(id: string, content: string): Promise<ITicket> {
    const response = await fetch(`${API_BASE}/${id}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
      body: JSON.stringify({ content }),
    });
    if (!response.ok) throw new Error("回复失败");
    return response.json();
  },

  // 管理员获取所有工单
  async getAllTickets(params?: {
    status?: string;
    priority?: string;
  }): Promise<ITicket[]> {
    const query = new URLSearchParams(params as any).toString();
    const response = await fetch(`${API_BASE}/admin/all?${query}`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
    });
    if (!response.ok) throw new Error("获取全部工单失败");
    return response.json();
  },

  // 管理员更新状态
  async updateStatus(id: string, status: string): Promise<ITicket> {
    const response = await fetch(`${API_BASE}/admin/${id}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
      body: JSON.stringify({ status }),
    });
    if (!response.ok) throw new Error("更新状态失败");
    return response.json();
  },
};
