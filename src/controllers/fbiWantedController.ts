import { Request, Response } from 'express';
import FBIWantedModel, { IFBIWanted } from '../models/fbiWantedModel';
import logger from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { isValidObjectId, Types } from 'mongoose';
import { IPFSService } from '../services/ipfsService';

// 生成NCIC编号
function generateNCICNumber(): string {
    const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let result = 'N'; // NCIC numbers often start with a letter
    for (let i = 0; i < 9; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// 生成FBI编号
function generateFBINumber(): string {
    const timestamp = Date.now().toString().slice(-8);
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `FBI-${timestamp}-${random}`;
}

// 输入验证和清理
function sanitizeInput(str: string | undefined | null): string {
    if (typeof str !== 'string' || !str) {
        return '';
    }
    return str.replace(/[<>]/g, '').trim();
}

// 使用UTC逻辑根据出生日期计算年龄，避免时区导致的偏差
function computeAgeFromDOB(dob: Date | string | null | undefined, now: Date = new Date()): number | null {
    if (!dob) return null;
    const birth = typeof dob === 'string' ? new Date(dob) : dob;
    if (isNaN(birth.getTime())) return null;

    const yearNow = now.getUTCFullYear();
    const monthNow = now.getUTCMonth();
    const dayNow = now.getUTCDate();

    const yearBirth = birth.getUTCFullYear();
    const monthBirth = birth.getUTCMonth();
    const dayBirth = birth.getUTCDate();

    let age = yearNow - yearBirth;
    if (monthNow < monthBirth || (monthNow === monthBirth && dayNow < dayBirth)) {
        age--;
    }
    return Math.max(0, age);
}

export const fbiWantedController = {
    // 获取所有通缉犯列表
    async getAllWanted(req: Request, res: Response) {
        try {
            const {
                page = 1,
                limit = 20,
                status = 'ACTIVE',
                dangerLevel,
                search
            } = req.query;

            const query: any = { isActive: true };

            // 仅允许白名单状态
            const allowedStatus = ['ACTIVE', 'CAPTURED', 'DECEASED', 'REMOVED', 'ALL'];
            if (typeof status === 'string' && allowedStatus.includes(status) && status !== 'ALL') {
                query.status = status;
            }

            // 仅允许白名单危险等级
            const allowedDanger = ['LOW', 'MEDIUM', 'HIGH', 'EXTREME', 'ALL'];
            if (typeof dangerLevel === 'string' && allowedDanger.includes(dangerLevel) && dangerLevel !== 'ALL') {
                query.dangerLevel = dangerLevel;
            }

            if (typeof search === 'string' && search.trim()) {
                // 严格限制搜索字符串，移除潜在危险字符，仅保留字母/数字/空格/引号/连字符
                const trimmed = search.substring(0, 100);
                const safeSearch = trimmed.replace(/[^\w\s'"-]/g, ' ').replace(/\s+/g, ' ').trim();
                if (safeSearch) {
                    query.$text = { $search: safeSearch };
                }
            }

            // 分页参数约束
            const pageNum = Math.max(1, Math.min(1000, Number(page) || 1));
            const limitNum = Math.max(1, Math.min(100, Number(limit) || 20));
            const skip = (pageNum - 1) * limitNum;

            const [wanted, total] = await Promise.all([
                FBIWantedModel.find(query)
                    .sort({ dateAdded: -1 })
                    .skip(skip)
                    .limit(limitNum)
                    .lean(),
                FBIWantedModel.countDocuments(query)
            ]);

            res.json({
                success: true,
                data: wanted,
                pagination: {
                    page: pageNum,
                    limit: limitNum,
                    total,
                    pages: Math.ceil(total / limitNum)
                }
            });
        } catch (error) {
            logger.error('获取通缉犯列表失败:', error);
            res.status(500).json({
                success: false,
                message: '获取通缉犯列表失败'
            });
        }
    },

    // 更新通缉犯头像图片（管理员）
    async updateWantedPhoto(req: Request, res: Response) {
        try {
            const { id } = req.params;
            if (!isValidObjectId(id)) {
                return res.status(400).json({ success: false, message: '无效的ID' });
            }

            // 需要 multer 解析后的单文件，字段名为 photo
            const file = (req as any).file as Express.Multer.File | undefined;
            if (!file) {
                return res.status(400).json({ success: false, message: '未找到上传的文件（字段名应为 photo）' });
            }

            // 上传到 IPFS（仅允许图片，大小上限在服务内校验）
            const uploadRes = await IPFSService.uploadFile(
                file.buffer,
                file.originalname || 'avatar.jpg',
                file.mimetype,
                { shortLink: false }
            );

            const photoUrl = uploadRes.web2url || uploadRes.url; // 优先使用可直接访问的 Web2 URL

            const updated = await FBIWantedModel.findByIdAndUpdate(
                id,
                { $set: { photoUrl, lastUpdated: new Date() } },
                { new: true, runValidators: true }
            );

            if (!updated) {
                return res.status(404).json({ success: false, message: '未找到该通缉犯记录' });
            }

            logger.info(`更新通缉犯头像成功: ${updated.name} (${updated.fbiNumber}) -> ${photoUrl}`);

            return res.json({
                success: true,
                message: '头像更新成功',
                data: updated,
                ipfs: uploadRes
            });
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            logger.error('更新通缉犯头像失败:', msg);
            return res.status(500).json({ success: false, message: '更新通缉犯头像失败', error: msg });
        }
    },

    // 根据ID获取单个通缉犯详情
    async getWantedById(req: Request, res: Response) {
        try {
            const { id } = req.params;
            if (!isValidObjectId(id)) {
                return res.status(400).json({ success: false, message: '无效的ID' });
            }

            const wanted = await FBIWantedModel.findById(id).lean();

            if (!wanted) {
                return res.status(404).json({
                    success: false,
                    message: '未找到该通缉犯信息'
                });
            }

            res.json({
                success: true,
                data: wanted
            });
        } catch (error) {
            logger.error('获取通缉犯详情失败:', error);
            res.status(500).json({
                success: false,
                message: '获取通缉犯详情失败'
            });
        }
    },

    // 创建新的通缉犯记录（管理员）
    async createWanted(req: Request, res: Response) {
        try {
            const {
                name,
                aliases = [],
                age,
                height,
                weight,
                eyes,
                hair,
                race,
                nationality,
                dateOfBirth,
                placeOfBirth,
                charges = [],
                description,
                reward,
                photoUrl = '',
                fingerprints = [],
                lastKnownLocation = '',
                dangerLevel = 'MEDIUM',
                occupation = '',
                scarsAndMarks = [],
                languages = [],
                caution = '',
                remarks = ''
            } = req.body;

            // 验证必填字段（只要求基本信息）
            if (!name || !charges.length || reward === undefined) {
                return res.status(400).json({
                    success: false,
                    message: '姓名、指控和悬赏金额是必填项'
                });
            }

            // 计算最终年龄：优先使用传入的 age；若未提供且提供了 DOB，则根据 DOB 计算
            let finalAge: number = (age !== undefined && age !== null && age !== '') ? Number(age) : NaN;
            if (!Number.isFinite(finalAge)) {
                const computed = computeAgeFromDOB(dateOfBirth ?? null);
                finalAge = computed ?? 0;
            }

            const newWanted = new FBIWantedModel({
                fbiNumber: generateFBINumber(),
                ncicNumber: generateNCICNumber(),
                name: sanitizeInput(name),
                aliases: aliases.map((alias: string) => sanitizeInput(alias)),
                age: finalAge,
                height: height ? sanitizeInput(height) : '未知',
                weight: weight ? sanitizeInput(weight) : '未知',
                eyes: eyes ? sanitizeInput(eyes) : '未知',
                hair: hair ? sanitizeInput(hair) : '未知',
                race: race ? sanitizeInput(race) : '未知',
                nationality: nationality ? sanitizeInput(nationality) : '未知',
                dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
                placeOfBirth: sanitizeInput(placeOfBirth),
                charges: charges.map((charge: string) => sanitizeInput(charge)),
                description: sanitizeInput(description),
                reward: Number(reward),
                photoUrl: sanitizeInput(photoUrl),
                fingerprints: fingerprints.map((fp: string) => sanitizeInput(fp)),
                lastKnownLocation: sanitizeInput(lastKnownLocation),
                dangerLevel,
                status: 'ACTIVE',
                dateAdded: new Date(),
                lastUpdated: new Date(),
                occupation: sanitizeInput(occupation),
                scarsAndMarks: scarsAndMarks.map((mark: string) => sanitizeInput(mark)),
                languages: languages.map((lang: string) => sanitizeInput(lang)),
                caution: sanitizeInput(caution),
                remarks: sanitizeInput(remarks),
                isActive: true
            });

            const savedWanted = await newWanted.save();

            logger.info(`创建新的通缉犯记录: ${savedWanted.name} (FBI: ${savedWanted.fbiNumber})`);

            res.status(201).json({
                success: true,
                message: '通缉犯记录创建成功',
                data: savedWanted
            });
        } catch (error) {
            logger.error('创建通缉犯记录失败:', error);
            res.status(500).json({
                success: false,
                message: '创建通缉犯记录失败'
            });
        }
    },

    // 更新通缉犯记录（管理员）
    async updateWanted(req: Request, res: Response) {
        try {
            const { id } = req.params;
            if (!isValidObjectId(id)) {
                return res.status(400).json({ success: false, message: '无效的ID' });
            }
            // 仅允许白名单字段被更新，避免批量赋值和操作符注入
            const allowedFields = new Set([
                'name',
                'description',
                'aliases',
                'charges',
                'dateOfBirth',
                'age',
                'dangerLevel',
                'status',
                'photoUrl',
                'fbiNumber',
                'ncicNumber',
            ]);

            const body = req.body && typeof req.body === 'object' ? req.body : {};
            const updateData: any = {};

            for (const [key, value] of Object.entries(body)) {
                // 拒绝以 $ 开头或包含点号的键，防止操作符注入/路径注入
                if (key.startsWith('$') || key.includes('.')) continue;
                if (!allowedFields.has(key)) continue;
                switch (key) {
                    case 'name':
                    case 'description':
                    case 'photoUrl':
                    case 'fbiNumber':
                    case 'ncicNumber':
                        updateData[key] = sanitizeInput(String(value));
                        break;
                    case 'aliases':
                    case 'charges':
                        if (Array.isArray(value)) {
                            updateData[key] = value.map((v) => sanitizeInput(String(v))).filter(Boolean);
                        }
                        break;
                    case 'dateOfBirth':
                        if (value) updateData.dateOfBirth = new Date(value as any);
                        break;
                    case 'dangerLevel': {
                        const allowedDanger = ['LOW', 'MEDIUM', 'HIGH', 'EXTREME'];
                        if (typeof value === 'string' && allowedDanger.includes(value)) {
                            updateData.dangerLevel = value;
                        }
                        break;
                    }
                    case 'status': {
                        const allowedStatus = ['ACTIVE', 'CAPTURED', 'DECEASED', 'REMOVED'];
                        if (typeof value === 'string' && allowedStatus.includes(value)) {
                            updateData.status = value;
                        }
                        break;
                    }
                    case 'age': {
                        if (value !== undefined && value !== null && value !== '') {
                            const num = Number(value);
                            if (!Number.isNaN(num) && Number.isFinite(num) && num >= 0 && num <= 1500) {
                                updateData.age = num;
                            }
                        }
                        break;
                    }
                }
            }

            // 如果更新了 dateOfBirth 而未明确提供 age，则基于 DOB 重新计算 age
            if ('dateOfBirth' in updateData && !('age' in updateData)) {
                const computed = computeAgeFromDOB(updateData.dateOfBirth ?? null);
                if (computed !== null) {
                    updateData.age = computed;
                }
            }

            // 若提供了 age，统一转为数字类型
            if ('age' in updateData && updateData.age !== undefined && updateData.age !== null && updateData.age !== '') {
                updateData.age = Number(updateData.age);
            }

            // 更新时间戳
            updateData.lastUpdated = new Date();

            const updatedWanted = await FBIWantedModel.findByIdAndUpdate(
                id,
                updateData,
                { new: true, runValidators: true }
            );

            if (!updatedWanted) {
                return res.status(404).json({
                    success: false,
                    message: '未找到该通缉犯记录'
                });
            }

            logger.info(`更新通缉犯记录: ${updatedWanted.name} (${updatedWanted.fbiNumber})`);

            res.json({
                success: true,
                message: '通缉犯记录更新成功',
                data: updatedWanted
            });
        } catch (error) {
            logger.error('更新通缉犯记录失败:', error);
            res.status(500).json({
                success: false,
                message: '更新通缉犯记录失败'
            });
        }
    },

    // 删除通缉犯记录（管理员）
    async deleteWanted(req: Request, res: Response) {
        try {
            const { id } = req.params;
            if (!isValidObjectId(id)) {
                return res.status(400).json({ success: false, message: '无效的ID' });
            }

            const deletedWanted = await FBIWantedModel.findByIdAndDelete(id);

            if (!deletedWanted) {
                return res.status(404).json({
                    success: false,
                    message: '未找到该通缉犯记录'
                });
            }

            logger.info(`删除通缉犯记录: ${deletedWanted.name} (${deletedWanted.fbiNumber})`);

            res.json({
                success: true,
                message: '通缉犯记录删除成功'
            });
        } catch (error) {
            logger.error('删除通缉犯记录失败:', error);
            res.status(500).json({
                success: false,
                message: '删除通缉犯记录失败'
            });
        }
    },

    // 根据条件批量删除通缉犯记录（管理员）
    async deleteMultiple(req: Request, res: Response) {
        try {
            const { filter } = req.body;
            if (!filter || typeof filter !== 'object') {
                return res.status(400).json({ success: false, message: '请提供有效的过滤条件' });
            }

            // 白名单过滤，防止注入危险操作符
            const safeFilter: any = {};
            const { status, dangerLevel, isActive, beforeDate, afterDate } = filter as Record<string, any>;
            const allowedStatus = ['ACTIVE', 'CAPTURED', 'DECEASED', 'REMOVED'];
            const allowedDanger = ['LOW', 'MEDIUM', 'HIGH', 'EXTREME'];
            if (typeof status === 'string' && allowedStatus.includes(status)) {
                safeFilter.status = status;
            }
            if (typeof dangerLevel === 'string' && allowedDanger.includes(dangerLevel)) {
                safeFilter.dangerLevel = dangerLevel;
            }
            if (typeof isActive === 'boolean') {
                safeFilter.isActive = isActive;
            }
            // 日期范围
            const dateFilter: any = {};
            if (beforeDate) {
                const d = new Date(beforeDate);
                if (!isNaN(d.getTime())) dateFilter.$lte = d;
            }
            if (afterDate) {
                const d = new Date(afterDate);
                if (!isNaN(d.getTime())) dateFilter.$gte = d;
            }
            if (Object.keys(dateFilter).length) {
                safeFilter.dateAdded = dateFilter;
            }

            const result = await FBIWantedModel.deleteMany(safeFilter);

            logger.info(`根据条件批量删除通缉犯记录: ${result.deletedCount} 条`);

            res.json({
                success: true,
                message: `成功删除 ${result.deletedCount} 条通缉犯记录`
            });
        } catch (error) {
            logger.error('根据条件批量删除通缉犯记录失败:', error);
            res.status(500).json({
                success: false,
                message: '根据条件批量删除通缉犯记录失败'
            });
        }
    },

    // 批量删除通缉犯记录（管理员）
    async batchDeleteWanted(req: Request, res: Response) {
        try {
            const { ids } = req.body;

            if (!Array.isArray(ids) || ids.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: '请提供有效的ID列表'
                });
            }

            // 仅删除有效的ObjectId
            const validIds = ids.filter((id: any) => typeof id === 'string' && isValidObjectId(id));
            if (validIds.length === 0) {
                return res.status(400).json({ success: false, message: 'ID列表无效' });
            }
            const result = await FBIWantedModel.deleteMany({
                _id: { $in: validIds.map((id: string) => new Types.ObjectId(id)) }
            });

            logger.info(`批量删除通缉犯记录: ${result.deletedCount} 条`);

            res.json({
                success: true,
                message: `成功删除 ${result.deletedCount} 条通缉犯记录`
            });
        } catch (error) {
            logger.error('批量删除通缉犯记录失败:', error);
            res.status(500).json({
                success: false,
                message: '批量删除通缉犯记录失败'
            });
        }
    },

    // 更新通缉犯状态（管理员）
    async updateWantedStatus(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const { status } = req.body;
            if (!isValidObjectId(id)) {
                return res.status(400).json({ success: false, message: '无效的ID' });
            }

            // 严格校验并白名单限制状态，防止注入恶意更新键
            const allowedStatuses = ['ACTIVE', 'CAPTURED', 'DECEASED', 'REMOVED'] as const;
            if (typeof status !== 'string' || !allowedStatuses.includes(status as any)) {
                return res.status(400).json({
                    success: false,
                    message: '无效的状态值'
                });
            }

            // 使用$set并显式字段，避免将用户输入直接作为更新对象传入
            type SafeStatus = typeof allowedStatuses[number];
            const safeStatus: SafeStatus = status as SafeStatus;

            const updatedWanted = await FBIWantedModel.findByIdAndUpdate(
                id,
                { $set: { status: safeStatus, lastUpdated: new Date() } },
                { new: true, runValidators: true }
            );

            if (!updatedWanted) {
                return res.status(404).json({
                    success: false,
                    message: '未找到该通缉犯记录'
                });
            }

            logger.info(`更新通缉犯状态: ${updatedWanted.name} -> ${status}`);

            res.json({
                success: true,
                message: '通缉犯状态更新成功',
                data: updatedWanted
            });
        } catch (error) {
            logger.error('更新通缉犯状态失败:', error);
            res.status(500).json({
                success: false,
                message: '更新通缉犯状态失败'
            });
        }
    },

    // 获取统计信息
    async getStatistics(req: Request, res: Response) {
        try {
            const [
                totalActive,
                totalCaptured,
                totalDeceased,
                dangerLevelStats,
                recentAdded
            ] = await Promise.all([
                FBIWantedModel.countDocuments({ status: 'ACTIVE', isActive: true }),
                FBIWantedModel.countDocuments({ status: 'CAPTURED', isActive: true }),
                FBIWantedModel.countDocuments({ status: 'DECEASED', isActive: true }),
                FBIWantedModel.aggregate([
                    { $match: { isActive: true } },
                    { $group: { _id: '$dangerLevel', count: { $sum: 1 } } }
                ]),
                FBIWantedModel.find({ isActive: true })
                    .sort({ dateAdded: -1 })
                    .limit(5)
                    .select('name fbiNumber dateAdded dangerLevel')
                    .lean()
            ]);

            const stats = {
                total: totalActive + totalCaptured + totalDeceased,
                active: totalActive,
                captured: totalCaptured,
                deceased: totalDeceased,
                dangerLevels: dangerLevelStats.reduce((acc: any, item: any) => {
                    acc[item._id] = item.count;
                    return acc;
                }, {}),
                recentAdded
            };

            res.json({
                success: true,
                data: stats
            });
        } catch (error) {
            logger.error('获取统计信息失败:', error);
            res.status(500).json({
                success: false,
                message: '获取统计信息失败'
            });
        }
    }
};
