export interface Resource {
  id: string;
  title: string;
  description: string;
  downloadUrl: string;
  price: number;
  category: string;
  imageUrl: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
} 