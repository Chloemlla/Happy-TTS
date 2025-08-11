import { Request, Response } from 'express';
import FBIWantedModel, { IFBIWanted } from '../models/fbiWantedModel';
import logger from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

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

            if (status && status !== 'ALL') {
                query.status = status;
            }

            if (dangerLevel && dangerLevel !== 'ALL') {
                query.dangerLevel = dangerLevel;
            }

            if (search) {
                query.$text = { $search: search as string };
            }

            const skip = (Number(page) - 1) * Number(limit);

            const [wanted, total] = await Promise.all([
                FBIWantedModel.find(query)
                    .sort({ dateAdded: -1 })
                    .skip(skip)
                    .limit(Number(limit))
                    .lean(),
                FBIWantedModel.countDocuments(query)
            ]);

            res.json({
                success: true,
                data: wanted,
                pagination: {
                    page: Number(page),
                    limit: Number(limit),
                    total,
                    pages: Math.ceil(total / Number(limit))
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

    // 根据ID获取单个通缉犯详情
    async getWantedById(req: Request, res: Response) {
        try {
            const { id } = req.params;

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
            const updateData: any = { ...req.body };

            // 清理输入数据
            if (updateData.name) updateData.name = sanitizeInput(updateData.name);
            if (updateData.description) updateData.description = sanitizeInput(updateData.description);
            if (updateData.aliases) updateData.aliases = updateData.aliases.map((alias: string) => sanitizeInput(alias));
            if (updateData.charges) updateData.charges = updateData.charges.map((charge: string) => sanitizeInput(charge));

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
                return res.status(400).json({
                    success: false,
                    message: '请提供有效的过滤条件'
                });
            }

            const result = await FBIWantedModel.deleteMany(filter);

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

            const result = await FBIWantedModel.deleteMany({
                _id: { $in: ids }
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

            if (!['ACTIVE', 'CAPTURED', 'DECEASED', 'REMOVED'].includes(status)) {
                return res.status(400).json({
                    success: false,
                    message: '无效的状态值'
                });
            }

            const updatedWanted = await FBIWantedModel.findByIdAndUpdate(
                id,
                {
                    status,
                    lastUpdated: new Date()
                },
                { new: true }
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
