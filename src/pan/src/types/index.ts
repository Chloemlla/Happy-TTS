// 基础类型
export interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

// 管理员类型
export interface Admin extends BaseEntity {
  username: string;
  email: string;
  password: string;
  isActive: boolean;
  lastLoginAt?: Date;
  role: 'admin' | 'super_admin';
}

// 资源类型
export interface Resource extends BaseEntity {
  title: string;
  description: string;
  downloadUrl: string;
  price: number;
  category: string;
  imageUrl?: string;
  isActive: boolean;
  tags: string[];
  downloads: number;
  rating: number;
}

// CDK类型
export interface CDK extends BaseEntity {
  code: string;
  resourceId: string;
  isUsed: boolean;
  usedAt?: Date;
  usedBy?: string;
  usedIp?: string;
  expiresAt?: Date;
  batchId?: string;
}

// 统计数据类型
export interface Stats {
  totalResources: number;
  totalCDKs: number;
  usedCDKs: number;
  availableCDKs: number;
  totalDownloads: number;
  totalRevenue: number;
  lastAdminLogin?: Date;
}

// 请求类型
export interface LoginRequest {
  username: string;
  password: string;
}

export interface CreateResourceRequest {
  title: string;
  description: string;
  downloadUrl: string;
  price: number;
  category: string;
  imageUrl?: string;
  tags?: string[];
}

export interface UpdateResourceRequest extends Partial<CreateResourceRequest> {
  id: string;
}

export interface GenerateCDKRequest {
  resourceId: string;
  quantity: number;
  expiresAt?: Date;
}

// 响应类型
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// 会话类型
export interface SessionData {
  adminId: string;
  username: string;
  role: string;
  loginTime: Date;
}

// 文件上传类型
export interface UploadedFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  destination: string;
  filename: string;
  path: string;
}

// 查询参数类型
export interface ResourceQuery {
  page?: number;
  limit?: number;
  category?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface CDKQuery {
  page?: number;
  limit?: number;
  resourceId?: string;
  isUsed?: boolean;
  batchId?: string;
}

// 中间件类型
export interface AuthenticatedRequest extends Request {
  admin?: Admin;
  session?: SessionData;
}

// 错误类型
export interface AppError extends Error {
  statusCode: number;
  isOperational: boolean;
} 