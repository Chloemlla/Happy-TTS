import mongoose from 'mongoose';
import { ICDK } from '../models/cdkModel';
import CDKModel from '../models/cdkModel';
import ResourceModel from '../models/resourceModel';
import { ResourceService } from './resourceService';
import { TransactionService } from './transactionService';
import logger from '../utils/logger';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

export class CDKService {
  private resourceService = new ResourceService();
  private readonly EXPORT_DIR = join(process.cwd(), 'data', 'exports');

  async redeemCDK(code: string, userInfo?: { userId: string; username: string }, forceRedeem?: boolean) {
    try {
      // 验证CDK代码格式
      if (!code || typeof code !== 'string' || code.length !== 16 || !/^[A-Z0-9]{16}$/.test(code)) {
        logger.warn('无效的CDK代码格式', { code });
        throw new Error('无效的CDK代码格式');
      }

      // 验证和清理用户信息以防止NoSQL注入
      if (userInfo) {
        if (!userInfo.userId || typeof userInfo.userId !== 'string' || userInfo.userId.length > 100) {
          logger.warn('无效的用户ID格式', { userId: userInfo.userId });
          throw new Error('无效的用户ID格式');
        }
        if (!userInfo.username || typeof userInfo.username !== 'string' || userInfo.username.length > 50) {
          logger.warn('无效的用户名格式', { username: userInfo.username });
          throw new Error('无效的用户名格式');
        }
        
        // 清理用户输入，移除潜在的NoSQL注入字符
        userInfo.userId = userInfo.userId.replace(/[{}$]/g, '');
        userInfo.username = userInfo.username.replace(/[{}$]/g, '');
      }
      
      // 首先查找CDK以获取资源ID
      const cdkToRedeem = await CDKModel.findOne({
        code,
        isUsed: false,
        $or: [
          { expiresAt: { $exists: false } },
          { expiresAt: { $gt: new Date() } }
        ]
      });
      
      if (!cdkToRedeem) {
        logger.warn('CDK兑换失败：无效或已使用', { code });
        throw new Error('无效或已使用的CDK');
      }

      // 如果提供了用户信息且未强制兑换，检查用户是否已拥有该资源
      if (userInfo && !forceRedeem) {
        // 使用参数化查询防止NoSQL注入
        const existingCDK = await CDKModel.findOne({
          resourceId: new mongoose.Types.ObjectId(cdkToRedeem.resourceId),
          isUsed: true,
          'usedBy.userId': { $eq: userInfo.userId } // 使用$eq操作符确保精确匹配
        });

        if (existingCDK) {
          // 用户已拥有该资源，返回特殊错误以触发前端确认对话框
          const resource = await this.resourceService.getResourceById(cdkToRedeem.resourceId);
          const error = new Error('DUPLICATE_RESOURCE') as any;
          error.resourceTitle = resource?.title || '未知资源';
          error.resourceId = cdkToRedeem.resourceId;
          throw error;
        }
      }
      
      const updateData: any = {
        isUsed: true,
        usedAt: new Date(),
        usedIp: '127.0.0.1' // 实际应用中需要获取真实IP
      };

      // 如果提供了用户信息，则记录用户信息
      if (userInfo) {
        updateData.usedBy = {
          userId: userInfo.userId,
          username: userInfo.username
        };
      }

      const cdk = await CDKModel.findOneAndUpdate(
        { 
          code, 
          isUsed: false,
          $or: [
            { expiresAt: { $exists: false } },
            { expiresAt: { $gt: new Date() } }
          ]
        },
        { $set: updateData },
        { new: true }
      );
      
      if (!cdk) {
        logger.warn('CDK兑换失败：无效或已使用', { code });
        throw new Error('无效或已使用的CDK');
      }

      const resource = await this.resourceService.getResourceById(cdk.resourceId);
      if (!resource) {
        logger.warn('CDK兑换失败：资源不存在', { code, resourceId: cdk.resourceId });
        throw new Error('资源不存在');
      }

      logger.info('CDK兑换成功', { code, resourceId: cdk.resourceId, resourceTitle: resource.title, forceRedeem });
      return {
        resource,
        cdk: cdk.toObject()
      };
    } catch (error) {
      logger.error('CDK兑换失败:', error);
      throw error;
    }
  }

  async getCDKs(page: number, resourceId?: string, filterType: 'all' | 'unused' | 'used' = 'all') {
    try {
      // 验证和清理输入参数
      const validatedPage = Math.max(1, Math.floor(Number(page) || 1));
      const pageSize = 10;
      const skip = (validatedPage - 1) * pageSize;
      
      // 验证resourceId格式
      const validatedResourceId = resourceId && 
        typeof resourceId === 'string' && 
        resourceId.trim() !== '' &&
        resourceId.length === 24 && 
        /^[0-9a-fA-F]{24}$/.test(resourceId) ? resourceId : undefined;
      
      const queryFilter: any = {};
      if (validatedResourceId) {
        queryFilter.resourceId = validatedResourceId;
      }
      
      // 根据过滤类型添加使用状态条件
      if (filterType === 'unused') {
        queryFilter.isUsed = false;
      } else if (filterType === 'used') {
        queryFilter.isUsed = true;
      }

      const [cdks, total] = await Promise.all([
        CDKModel.find(queryFilter).skip(skip).limit(pageSize).sort({ createdAt: -1 }),
        CDKModel.countDocuments(queryFilter)
      ]);

      logger.info('获取CDK列表成功', { page: validatedPage, resourceId: validatedResourceId, total });
      return {
        cdks: cdks.map(c => {
          const obj = c.toObject();
          // 确保id字段存在，将_id转换为id
          obj.id = obj._id.toString();
          delete obj._id;
          delete obj.__v;
          return obj;
        }),
        total,
        page: validatedPage,
        pageSize
      };
    } catch (error) {
      logger.error('获取CDK列表失败:', error);
      throw error;
    }
  }

  async getCDKStats() {
    try {
      const [total, used] = await Promise.all([
        CDKModel.countDocuments(),
        CDKModel.countDocuments({ isUsed: true })
      ]);

      logger.info('获取CDK统计成功', { total, used, available: total - used });
      return {
        total,
        used,
        available: total - used
      };
    } catch (error) {
      logger.error('获取CDK统计失败:', error);
      throw error;
    }
  }

  async generateCDKs(resourceId: string, count: number, expiresAt?: Date) {
    try {
      // 使用事务确保数据一致性
      return await TransactionService.generateCDKsWithTransaction(resourceId, count, expiresAt);
    } catch (error) {
      logger.error('生成CDK失败:', error);
      throw error;
    }
  }

  async updateCDK(id: string, updateData: { code?: string; resourceId?: string; expiresAt?: Date }) {
    try {
      // 验证ID格式
      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new Error('无效的CDK ID格式');
      }

      const cdk = await CDKModel.findById(id);
      if (!cdk) {
        throw new Error('CDK不存在');
      }

      if (cdk.isUsed) {
        throw new Error('已使用的CDK无法编辑');
      }

      // 验证更新数据
      const validatedData: any = {};

      if (updateData.code !== undefined) {
        // 验证CDK代码格式
        if (!updateData.code || typeof updateData.code !== 'string' || updateData.code.length !== 16 || !/^[A-Z0-9]{16}$/.test(updateData.code)) {
          throw new Error('无效的CDK代码格式');
        }
        
        // 检查代码是否已存在（排除当前CDK）
        const existingCDK = await CDKModel.findOne({ 
          code: updateData.code, 
          _id: { $ne: id } 
        });
        if (existingCDK) {
          throw new Error('CDK代码已存在');
        }
        
        validatedData.code = updateData.code;
      }

      if (updateData.resourceId !== undefined) {
        // 验证资源ID格式
        if (!mongoose.Types.ObjectId.isValid(updateData.resourceId)) {
          throw new Error('无效的资源ID格式');
        }
        
        // 验证资源是否存在
        const resource = await this.resourceService.getResourceById(updateData.resourceId);
        if (!resource) {
          throw new Error('资源不存在');
        }
        
        validatedData.resourceId = updateData.resourceId;
      }

      if (updateData.expiresAt !== undefined) {
        if (updateData.expiresAt && new Date(updateData.expiresAt) <= new Date()) {
          throw new Error('过期时间必须晚于当前时间');
        }
        validatedData.expiresAt = updateData.expiresAt;
      }

      const updatedCDK = await CDKModel.findByIdAndUpdate(
        id,
        { $set: validatedData },
        { new: true }
      );

      logger.info('更新CDK成功', { id, updateData: validatedData });
      return updatedCDK;
    } catch (error) {
      logger.error('更新CDK失败:', error);
      throw error;
    }
  }

  async deleteCDK(id: string) {
    try {
      // 验证ID格式
      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new Error('无效的CDK ID格式');
      }

      const cdk = await CDKModel.findById(id);
      if (!cdk) {
        throw new Error('CDK不存在');
      }

      if (cdk.isUsed) {
        throw new Error('已使用的CDK无法删除');
      }

      await CDKModel.findByIdAndDelete(id);
      logger.info('删除CDK成功', { id, code: cdk.code });
    } catch (error) {
      logger.error('删除CDK失败:', error);
      throw error;
    }
  }

  // 批量删除CDK
  async batchDeleteCDKs(ids: string[]) {
    try {
      // 验证输入参数
      if (!Array.isArray(ids) || ids.length === 0) {
        throw new Error('请提供有效的CDK ID列表');
      }

      // 验证每个ID的格式
      const validIds = ids.filter(id => 
        typeof id === 'string' && 
        id.length === 24 && 
        /^[0-9a-fA-F]{24}$/.test(id)
      );

      if (validIds.length === 0) {
        throw new Error('没有有效的CDK ID');
      }

      // 查找所有要删除的CDK
      const cdks = await CDKModel.find({ _id: { $in: validIds } });
      
      if (cdks.length === 0) {
        throw new Error('没有找到要删除的CDK');
      }

      // 检查是否有已使用的CDK
      const usedCDKs = cdks.filter(cdk => cdk.isUsed);
      if (usedCDKs.length > 0) {
        const usedCodes = usedCDKs.map(cdk => cdk.code).join(', ');
        throw new Error(`以下CDK已被使用，无法删除：${usedCodes}`);
      }

      // 执行批量删除
      const deleteResult = await CDKModel.deleteMany({ 
        _id: { $in: validIds },
        isUsed: false // 双重保险，确保不删除已使用的CDK
      });

      logger.info('批量删除CDK成功', { 
        requestedCount: ids.length,
        validCount: validIds.length,
        deletedCount: deleteResult.deletedCount,
        deletedCodes: cdks.map(cdk => cdk.code)
      });

      return {
        requestedCount: ids.length,
        validCount: validIds.length,
        deletedCount: deleteResult.deletedCount,
        deletedCodes: cdks.map(cdk => cdk.code)
      };
    } catch (error) {
      logger.error('批量删除CDK失败:', error);
      throw error;
    }
  }

  // 获取用户已兑换的资源
  async getUserRedeemedResources(userIp: string) {
    try {
      // 查找该IP地址兑换过的CDK
      const redeemedCDKs = await CDKModel.find({ 
        isUsed: true, 
        usedIp: userIp 
      }).sort({ usedAt: -1 });

      if (redeemedCDKs.length === 0) {
        return { resources: [], total: 0 };
      }

      // 获取资源详情
      const resourceIds = [...new Set(redeemedCDKs.map(cdk => cdk.resourceId))];
      const resources = await ResourceModel.find({ _id: { $in: resourceIds } });

      // 合并CDK信息和资源信息
      const result = resources.map((resource: any) => {
        const relatedCDKs = redeemedCDKs.filter(cdk => cdk.resourceId === resource._id.toString());
        const latestRedemption = relatedCDKs[0]; // 已按时间排序
        
        return {
          id: resource._id.toString(),
          title: resource.title,
          description: resource.description,
          downloadUrl: resource.downloadUrl,
          price: resource.price,
          category: resource.category,
          imageUrl: resource.imageUrl,
          redeemedAt: latestRedemption.usedAt,
          cdkCode: latestRedemption.code,
          redemptionCount: relatedCDKs.length
        };
      });

      logger.info('获取用户已兑换资源成功', { userIp, total: result.length });
      return { resources: result, total: result.length };
    } catch (error) {
      logger.error('获取用户已兑换资源失败:', error);
      throw error;
    }
  }

  // 获取CDK总数量
  async getTotalCDKCount() {
    try {
      const count = await CDKModel.countDocuments({});
      logger.info('获取CDK总数量成功', { totalCount: count });
      return { totalCount: count };
    } catch (error) {
      logger.error('获取CDK总数量失败:', error);
      throw error;
    }
  }

  // 删除所有CDK
  async deleteAllCDKs() {
    try {
      const result = await CDKModel.deleteMany({});
      logger.info('删除所有CDK成功', { deletedCount: result.deletedCount });
      return { deletedCount: result.deletedCount };
    } catch (error) {
      logger.error('删除所有CDK失败:', error);
      throw error;
    }
  }

  // 删除所有未使用的CDK
  async deleteUnusedCDKs() {
    try {
      const result = await CDKModel.deleteMany({ isUsed: false });
      logger.info('删除所有未使用CDK成功', { deletedCount: result.deletedCount });
      return { deletedCount: result.deletedCount };
    } catch (error) {
      logger.error('删除所有未使用CDK失败:', error);
      throw error;
    }
  }

  /**
   * 导入CDK数据（管理员功能）- 异步并发处理
   * 内容格式兼容多种导出样式，例如：
   *  - "1. CDK信息" / "1. CDK 信息"
   *  - 字段名支持："CDK代码:" 或 "代码:", "资源ID:", "过期时间:"
   */
  async importCDKs(content: string) {
    try {
      const lines = content.split('\n');
      const itemsToImport: any[] = [];
      let current: any = {};

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // 开始新条目
        if (/^\d+\./.test(line) && /CDK/.test(line)) {
          if (current.code && current.resourceId) {
            itemsToImport.push({ ...current });
          }
          current = {};
          continue;
        }

        // 解析字段
        if (line.startsWith('CDK代码: ')) {
          current.code = line.replace('CDK代码: ', '').trim();
        } else if (line.startsWith('代码: ')) {
          current.code = line.replace('代码: ', '').trim();
        } else if (line.startsWith('资源ID: ')) {
          current.resourceId = line.replace('资源ID: ', '').trim();
        } else if (line.startsWith('过期时间: ')) {
          current.expiresAt = line.replace('过期时间: ', '').trim();
        }
      }

      // 处理最后一条
      if (current.code && current.resourceId) {
        itemsToImport.push({ ...current });
      }

      const results = await this.processCDKsAsync(itemsToImport);

      logger.info('导入CDK数据完成', {
        importedCount: results.importedCount,
        skippedCount: results.skippedCount,
        errorCount: results.errorCount,
        totalItems: itemsToImport.length
      });

      return results;
    } catch (error) {
      logger.error('导入CDK数据失败:', error);
      throw error;
    }
  }

  /**
   * 异步并发处理多个CDK
   */
  private async processCDKsAsync(items: any[]): Promise<{
    importedCount: number;
    skippedCount: number;
    errorCount: number;
    errors: string[];
  }> {
    const batchSize = 10;
    const errors: string[] = [];
    let importedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);

      const batchPromises = batch.map(async (item) => {
        try {
          const result = await this.processImportCDKAsync(item);
          return result;
        } catch (error) {
          return {
            skipped: false,
            error: `CDK ${item.code}: ${error instanceof Error ? error.message : String(error)}`
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);

      batchResults.forEach((r) => {
        if (r.error) {
          errors.push(r.error);
          errorCount++;
        } else if (r.skipped) {
          skippedCount++;
        } else {
          importedCount++;
        }
      });

      logger.info(`处理CDK批次 ${Math.floor(i / batchSize) + 1}/${Math.ceil(items.length / batchSize)}`, {
        batchSize: batch.length,
        processed: i + batch.length,
        total: items.length
      });
    }

    return {
      importedCount,
      skippedCount,
      errorCount,
      errors: errors.slice(0, 10)
    };
  }

  /**
   * 处理单个导入CDK - 异步版本
   */
  private async processImportCDKAsync(item: any): Promise<{ skipped: boolean; error?: string }> {
    return new Promise(async (resolve) => {
      try {
        // 必需字段
        if (!item.code || !item.resourceId) {
          throw new Error('缺少必需的CDK代码或资源ID');
        }

        // 过滤无效值
        if (item.code === 'undefined' || item.resourceId === 'undefined' || !String(item.code).trim() || !String(item.resourceId).trim()) {
          throw new Error('CDK代码或资源ID包含无效值');
        }

        const code = String(item.code).trim();
        const resourceId = String(item.resourceId).trim();

        // 验证代码格式：16位大写字母数字
        if (!/^[A-Z0-9]{16}$/.test(code)) {
          throw new Error('无效的CDK代码格式');
        }

        // 验证资源ID
        if (!mongoose.isValidObjectId(resourceId)) {
          throw new Error('无效的资源ID');
        }
        const resourceExists = await ResourceModel.exists({ _id: new mongoose.Types.ObjectId(resourceId) });
        if (!resourceExists) {
          throw new Error('资源不存在');
        }

        // 过期时间（可选）
        let expiresAt: Date | undefined = undefined;
        if (item.expiresAt) {
          const d = new Date(String(item.expiresAt));
          if (isNaN(d.getTime())) {
            throw new Error('过期时间格式无效');
          }
          if (d.getTime() <= Date.now()) {
            throw new Error('过期时间必须晚于当前时间');
          }
          expiresAt = d;
        }

        // 重复检查
        const existing = await CDKModel.findOne({ code });
        if (existing) {
          logger.info(`跳过重复CDK: ${code}`);
          resolve({ skipped: true });
          return;
        }

        // 创建
        const doc: Partial<ICDK> = {
          code,
          resourceId,
          isUsed: false,
          createdAt: new Date()
        } as any;
        if (expiresAt) (doc as any).expiresAt = expiresAt;

        await CDKModel.create(doc);
        logger.debug(`成功导入CDK: ${code}`);
        resolve({ skipped: false });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.warn(`导入CDK失败 ${item.code}: ${msg}`);
        resolve({ skipped: false, error: msg });
      }
    });
  }

  /**
   * 导出CDK：若数量 > 5，则在后端生成UTF-8(BOM)文本文件供下载；否则以内联文本返回
   */
  public async exportCDKs(resourceId?: string, filterType: 'all' | 'unused' | 'used' = 'all'): Promise<
    { mode: 'file'; filename: string; filePath: string; count: number } |
    { mode: 'inline'; filename: string; content: string; count: number }
  > {
    try {
      // 可选过滤 resourceId（24位hex）
      const validatedResourceId = resourceId &&
        typeof resourceId === 'string' &&
        resourceId.trim() !== '' &&
        resourceId.length === 24 &&
        /^[0-9a-fA-F]{24}$/.test(resourceId) ? resourceId : undefined;

      const query: any = {};
      if (validatedResourceId) query.resourceId = validatedResourceId;
      if (filterType === 'unused') query.isUsed = false;
      if (filterType === 'used') query.isUsed = true;

      // 先统计总数，决定导出策略
      const count = await CDKModel.countDocuments(query);

      const now = new Date();
      const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
      const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
      const filterLabel = filterType === 'all' ? '全部' : filterType === 'unused' ? '未使用' : '已使用';
      const filename = validatedResourceId
        ? `CDK导出_${filterLabel}_${validatedResourceId}_${ts}.txt`
        : `CDK导出_${filterLabel}_${ts}.txt`;

      // 通用的头部文本（稍后与BOM组合）
      const header = `=== ${filterLabel}CDK导出报告 ===\n导出时间: ${now.toLocaleString('zh-CN')}\n${validatedResourceId ? `资源ID: ${validatedResourceId}\n` : ''}导出类型: ${filterLabel}\n总数量: ${count}\n\n`;

      // 字段投影，减少IO与解码成本
      const projection = {
        code: 1,
        resourceId: 1,
        createdAt: 1,
        expiresAt: 1,
        isUsed: 1,
        usedAt: 1,
        usedIp: 1,
        'usedBy.userId': 1,
        'usedBy.username': 1
      } as const;

      if (count <= 5) {
        // 小数据量：以内联字符串返回，但仍然用游标逐行拼接，避免意外的超量占用
        const cursor = CDKModel.find(query).sort({ createdAt: -1 }).select(projection).lean().cursor();
        let index = 0;
        let body = header;
        for await (const c of cursor as any) {
          body += [
            `${index + 1}. CDK代码: ${c.code}`,
            `   资源ID: ${c.resourceId}`,
            `   创建时间: ${new Date(c.createdAt).toLocaleString('zh-CN')}`,
            c.expiresAt ? `   过期时间: ${new Date(c.expiresAt).toLocaleString('zh-CN')}` : undefined,
            c.isUsed ? `   使用状态: 已使用` : '   使用状态: 未使用',
            c.isUsed && c.usedAt ? `   使用时间: ${new Date(c.usedAt).toLocaleString('zh-CN')}` : undefined,
            c.isUsed && c.usedIp ? `   使用IP: ${c.usedIp}` : undefined,
            c.isUsed && c.usedBy?.username ? `   使用用户: ${c.usedBy.username} (ID: ${c.usedBy.userId || '-'})` : undefined,
            ''
          ].filter(Boolean).join('\n') + '\n';
          index++;
        }
        body += `=== 导出完成 ===\n`;
        const contentWithBOM = `\uFEFF${body}`;
        logger.info('以内联文本返回CDK导出内容', { count });
        return { mode: 'inline', filename, content: contentWithBOM, count };
      }

      // 大数据量：写入到文件（流式），避免内存峰值
      if (!existsSync(this.EXPORT_DIR)) {
        await mkdir(this.EXPORT_DIR, { recursive: true });
      }
      const filePath = join(this.EXPORT_DIR, filename);

      // 使用写流 + 游标逐行写入
      const fs = await import('fs');
      const { createWriteStream } = fs;
      const ws = createWriteStream(filePath, { encoding: 'utf8' });

      // 先写入BOM与头
      ws.write('\uFEFF');
      ws.write(header);

      const cursor = CDKModel.find(query).sort({ createdAt: -1 }).select(projection).lean().cursor();
      let index = 0;
      for await (const c of cursor as any) {
        const line = [
          `${index + 1}. CDK代码: ${c.code}`,
          `   资源ID: ${c.resourceId}`,
          `   创建时间: ${new Date(c.createdAt).toLocaleString('zh-CN')}`,
          c.expiresAt ? `   过期时间: ${new Date(c.expiresAt).toLocaleString('zh-CN')}` : undefined,
          c.isUsed ? `   使用状态: 已使用` : '   使用状态: 未使用',
          c.isUsed && c.usedAt ? `   使用时间: ${new Date(c.usedAt).toLocaleString('zh-CN')}` : undefined,
          c.isUsed && c.usedIp ? `   使用IP: ${c.usedIp}` : undefined,
          c.isUsed && c.usedBy?.username ? `   使用用户: ${c.usedBy.username} (ID: ${c.usedBy.userId || '-'})` : undefined,
          ''
        ].filter(Boolean).join('\n') + '\n';
        if (!ws.write(line)) {
          await new Promise<void>(resolve => ws.once('drain', resolve));
        }
        index++;
      }
      ws.write('=== 导出完成 ===\n');
      await new Promise<void>((resolve, reject) => {
        ws.end(() => resolve());
        ws.on('error', reject);
      });

      logger.info('CDK导出操作', { resourceId, filterType, count, mode: 'file', filename });
      return { mode: 'file', filename, filePath, count };
    } catch (err) {
      logger.error('导出CDK失败', { err });
      throw err;
    }
  }

  private generateUniqueCode(): string {
    // 生成16位随机字符串
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 16; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }
} 