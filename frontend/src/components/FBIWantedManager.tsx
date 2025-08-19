import React, { useState, useEffect, useCallback, ChangeEvent, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { FaSearch, FaPlus, FaEye, FaEdit, FaTrash, FaExclamationTriangle, FaFilter, FaUser, FaTimes, FaImage, FaUpload, FaShieldAlt, FaUserSecret, FaSpinner, FaSave } from 'react-icons/fa';
import { useNotification } from './Notification';
import getApiBaseUrl from '../api';
import { openDB } from 'idb';
import ImageUploadSection from './ImageUploadSection';

// 通缉犯接口定义
interface FBIWanted {
    _id: string;
    name: string;
    aliases: string[];
    age: number;
    height: string;
    weight: string;
    eyes: string;
    hair: string;
    race: string;
    nationality: string;
    dateOfBirth: string;
    placeOfBirth: string;
    charges: string[];
    description: string;
    reward: number;
    photoUrl: string;
    fingerprints: string[];
    lastKnownLocation: string;
    dangerLevel: string;
    status: 'ACTIVE' | 'CAPTURED' | 'DECEASED' | 'REMOVED';
    dateAdded: string;
    lastUpdated: string;
    fbiNumber: string;
    ncicNumber: string;
    occupation: string;
    scarsAndMarks: string[];
    languages: string[];
    caution: string;
    remarks: string;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}

// 统计信息接口
interface Statistics {
    total: number;
    active: number;
    captured: number;
    deceased: number;
    dangerLevels: Record<string, number>;
    recentAdded: Array<{
        name: string;
        fbiNumber: string;
        dateAdded: string;
        dangerLevel: string;
    }>;
}

const FBIWantedManager: React.FC = () => {
    const { setNotification } = useNotification();

    // 图片上传限制
    const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
    const ALLOWED_TYPES = [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/gif',
        'image/webp',
        'image/bmp',
        'image/svg+xml'
    ];
    const [wantedList, setWantedList] = useState<FBIWanted[]>([]);
    const [statistics, setStatistics] = useState<Statistics | null>(null);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [dangerFilter, setDangerFilter] = useState('ALL');
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [selectedWanted, setSelectedWanted] = useState<FBIWanted | null>(null);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showViewModal, setShowViewModal] = useState(false);
    const [pendingPhoto, setPendingPhoto] = useState<string>('');
    const [photoPreview, setPhotoPreview] = useState<string>('');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [formData, setFormData] = useState<Partial<FBIWanted>>({});

    // 获取通缉犯列表
    const fetchWantedList = useCallback(async () => {
        try {
            setLoading(true);
            const params = new URLSearchParams({
                page: currentPage.toString(),
                limit: '20',
                ...(statusFilter !== 'ALL' && { status: statusFilter }),
                ...(dangerFilter !== 'ALL' && { dangerLevel: dangerFilter }),
                ...(searchTerm && { search: searchTerm })
            });

            const response = await fetch(`${getApiBaseUrl()}/api/fbi-wanted?${params}`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                setWantedList(data.data);
                setTotalPages(data.pagination.pages);
                // DEBUG: log ages from list to observe any unexpected adjustments
                try {
                    console.log('[FBIWanted][List] Ages:', Array.isArray(data?.data) ? data.data.map((w: any) => w?.age) : 'N/A');
                } catch (e) {
                    // ignore
                }
            }
        } catch (error) {
            console.error('获取通缉犯列表失败:', error);
        } finally {
            setLoading(false);
        }
    }, [currentPage, statusFilter, dangerFilter, searchTerm]);

    // 获取统计信息
    const fetchStatistics = useCallback(async () => {
        try {
            const response = await fetch(`${getApiBaseUrl()}/api/fbi-wanted/statistics`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                setStatistics(data.data);
            }
        } catch (error) {
            console.error('获取统计信息失败:', error);
        }
    }, []);

    useEffect(() => {
        fetchWantedList();
        fetchStatistics();
    }, [fetchWantedList, fetchStatistics]);

    // 危险等级颜色映射
    const getDangerLevelColor = (level: string) => {
        switch (level) {
            case 'LOW': return 'text-green-600 bg-green-100';
            case 'MEDIUM': return 'text-yellow-600 bg-yellow-100';
            case 'HIGH': return 'text-orange-600 bg-orange-100';
            case 'EXTREME': return 'text-red-600 bg-red-100';
            default: return 'text-gray-600 bg-gray-100';
        }
    };

    // 状态颜色映射
    const getStatusColor = (status: string) => {
        switch (status) {
            case 'ACTIVE': return 'text-red-600 bg-red-100';
            case 'CAPTURED': return 'text-green-600 bg-green-100';
            case 'DECEASED': return 'text-gray-600 bg-gray-100';
            case 'REMOVED': return 'text-blue-600 bg-blue-100';
            default: return 'text-gray-600 bg-gray-100';
        }
    };

    // 创建通缉犯
    const handleCreateWanted = async () => {
        try {
            setLoading(true);
            const dataToSubmit = {
                ...formData,
                photoUrl: pendingPhoto || formData.photoUrl || ''
            };

            // DEBUG: log submitted age and related fields
            console.log('[FBIWanted][Create] Submitting payload age:', (dataToSubmit as any).age, 'DOB:', (dataToSubmit as any).dateOfBirth, dataToSubmit);

            const response = await fetch(`${getApiBaseUrl()}/api/fbi-wanted`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(dataToSubmit)
            });

            if (response.ok) {
                // DEBUG: attempt to read response json to inspect returned age
                try {
                    const created = await response.json();
                    const returnedAge = created?.data?.age ?? created?.age;
                    console.log('[FBIWanted][Create] Response age:', returnedAge, created);
                } catch (e) {
                    console.log('[FBIWanted][Create] No JSON body in create response or parse failed');
                }
                setShowCreateModal(false);
                setFormData({});
                fetchWantedList();
                fetchStatistics();
                setNotification({ message: '通缉犯创建成功！', type: 'success' });
            } else {
                const error = await response.json();
                setNotification({ message: `创建失败: ${error.message || '未知错误'}`, type: 'error' });
            }
        } catch (error) {
            console.error('创建通缉犯失败:', error);
            setNotification({ message: '创建失败，请检查网络连接', type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    // 更新通缉犯
    const handleUpdateWanted = async () => {
        if (!selectedWanted) return;

        try {
            setLoading(true);
            // 构建提交数据，确保包含照片更新
            const dataToSubmit = {
                ...formData,
                photoUrl: pendingPhoto || (formData as any).photoUrl || selectedWanted?.photoUrl || ''
            } as any;
            // DEBUG: log updated payload before sending
            console.log('[FBIWanted][Update] Submitting payload:', {
                age: (dataToSubmit as any).age,
                DOB: (dataToSubmit as any).dateOfBirth,
                photoUrl: (dataToSubmit as any).photoUrl
            }, dataToSubmit);
            const response = await fetch(`${getApiBaseUrl()}/api/fbi-wanted/${selectedWanted._id}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(dataToSubmit)
            });

            if (response.ok) {
                // DEBUG: attempt to read response json to inspect returned age after update
                try {
                    const updated = await response.json();
                    const returnedAge = updated?.data?.age ?? updated?.age;
                    console.log('[FBIWanted][Update] Response age:', returnedAge, updated);
                } catch (e) {
                    console.log('[FBIWanted][Update] No JSON body in update response or parse failed');
                }
                setShowEditModal(false);
                setSelectedWanted(null);
                setFormData({});
                setPendingPhoto('');
                setPhotoPreview('');
                fetchWantedList();
                fetchStatistics();
                setNotification({ message: '通缉犯信息更新成功！', type: 'success' });
            } else {
                const error = await response.json();
                setNotification({ message: `更新失败: ${error.message || '未知错误'}`, type: 'error' });
            }
        } catch (error) {
            console.error('更新通缉犯失败:', error);
            setNotification({ message: '更新失败，请检查网络连接', type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    // 根据条件批量删除
    const handleBatchDelete = async (filter: object, confirmationMessage: string) => {
        if (!confirm(confirmationMessage)) {
            return;
        }

        try {
            setLoading(true);
            const response = await fetch(`${getApiBaseUrl()}/api/fbi-wanted/multiple`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ filter })
            });

            const result = await response.json();

            if (response.ok) {
                setNotification({ message: result.message || '批量删除成功！', type: 'success' });
                fetchWantedList();
                fetchStatistics();
            } else {
                setNotification({ message: result.message || '批量删除失败', type: 'error' });
            }
        } catch (error) {
            console.error('批量删除失败:', error);
            setNotification({ message: '操作失败，请检查网络连接', type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    // 删除通缉犯
    const handleDeleteWanted = async (id: string) => {
        try {
            setLoading(true);
            const response = await fetch(`${getApiBaseUrl()}/api/fbi-wanted/${id}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                fetchWantedList();
                fetchStatistics();
                setNotification({ message: '通缉犯记录删除成功！', type: 'success' });
            } else {
                const error = await response.json();
                setNotification({ message: `删除失败: ${error.message || '未知错误'}`, type: 'error' });
            }
        } catch (error) {
            console.error('删除通缉犯失败:', error);
            setNotification({ message: '删除失败，请检查网络连接', type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    // 重置表单
    const resetForm = () => {
        setFormData({
            name: '',
            fbiNumber: '',
            age: 0,
            dangerLevel: 'LOW',
            status: 'ACTIVE',
            reward: 0,
            charges: [],
            description: ''
        });
        setPendingPhoto('');
        setPhotoPreview('');
    };

    // 处理图片上传
    const handleImageUpload = async (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // 验证文件类型
        if (!ALLOWED_TYPES.includes(file.type)) {
            setNotification({ message: '请选择有效的图片格式 (JPEG, PNG, WebP, GIF)', type: 'error' });
            return;
        }

        // 验证文件大小
        if (file.size > MAX_IMAGE_SIZE) {
            setNotification({ message: '图片大小不能超过 5MB', type: 'error' });
            return;
        }

        try {
            setLoading(true);
            const formData = new FormData();
            formData.append('file', file);

            const response = await fetch(`${getApiBaseUrl()}/api/ipfs/upload`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: formData
            });

            const result = await response.json();

            if (response.ok && result?.data) {
                const url = result.data.web2url || result.data.url;
                if (url) {
                    setPendingPhoto(url);
                    setPhotoPreview(url);
                    setNotification({ message: '图片上传成功', type: 'success' });
                } else {
                    setNotification({ message: '上传成功但未返回图片URL', type: 'warning' as any });
                }
            } else {
                setNotification({ message: (result && (result.message || result.error)) || '图片上传失败', type: 'error' });
            }
        } catch (error) {
            setNotification({ message: '图片上传失败，请检查网络连接', type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    // 图片预览组件
    const ImagePreview = ({ src, alt = '通缉犯照片' }: { src?: string; alt?: string }) => {
        const [error, setError] = useState(false);

        if (!src || error) {
            return (
                <div className="w-full h-48 bg-gray-100 rounded-lg flex items-center justify-center">
                    <FaUser className="text-4xl text-gray-400" />
                </div>
            );
        }

        return (
            <img
                src={src}
                alt={alt}
                className="w-full h-48 object-cover rounded-lg"
                onError={() => setError(true)}
            />
        );
    };

    const prefersReducedMotion = useReducedMotion();
    const hoverScale = React.useCallback((scale: number, enabled: boolean = true) => (
        enabled && !prefersReducedMotion ? { scale } : undefined
    ), [prefersReducedMotion]);
    const tapScale = React.useCallback((scale: number, enabled: boolean = true) => (
        enabled && !prefersReducedMotion ? { scale } : undefined
    ), [prefersReducedMotion]);

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 py-8 px-4 rounded-lg">
            <div className="max-w-7xl mx-auto px-4 space-y-8">
                {/* 标题和统计信息部分 */}
                <motion.div
                    className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 overflow-hidden"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                >
                    <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6">
                        <div className="text-center">
                            <motion.div
                                className="flex items-center justify-center gap-3 mb-4"
                                initial={{ scale: 0.9 }}
                                animate={{ scale: 1 }}
                                transition={{ duration: 0.5, delay: 0.2 }}
                            >
                                <FaUserSecret className="text-4xl" />
                                <h1 className="text-4xl font-bold">FBI通缉犯管理系统</h1>
                            </motion.div>
                            <motion.p
                                className="text-blue-100 text-lg"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ duration: 0.5, delay: 0.4 }}
                            >
                                权威的FBI通缉犯信息管理平台
                            </motion.p>
                        </div>
                    </div>

                    {/* 统计信息 */}
                    {statistics && (
                        <div className="p-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <FaExclamationTriangle className="text-red-600" />
                                        <h3 className="text-red-700 font-semibold">在逃通缉犯</h3>
                                    </div>
                                    <p className="text-2xl font-bold text-red-600">{statistics.active}</p>
                                </div>

                                <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <FaShieldAlt className="text-green-600" />
                                        <h3 className="text-green-700 font-semibold">已抓获</h3>
                                    </div>
                                    <p className="text-2xl font-bold text-green-600">{statistics.captured}</p>
                                </div>

                                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <FaUserSecret className="text-blue-600" />
                                        <h3 className="text-blue-700 font-semibold">总计</h3>
                                    </div>
                                    <p className="text-2xl font-bold text-blue-600">{statistics.total}</p>
                                </div>

                                <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <FaExclamationTriangle className="text-purple-600" />
                                        <h3 className="text-purple-700 font-semibold">极度危险</h3>
                                    </div>
                                    <p className="text-2xl font-bold text-purple-600">
                                        {statistics.dangerLevels.EXTREME || 0}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </motion.div>

                {/* 搜索和过滤部分 */}
                <motion.div
                    className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 p-6"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.1 }}
                >
                    <div className="flex flex-col lg:flex-row gap-4 items-center justify-between">
                        <div className="flex flex-col sm:flex-row gap-4 flex-1">
                            <div className="relative flex-1">
                                <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="搜索通缉犯姓名、FBI编号或罪名..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                />
                            </div>

                            <select
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                                className="px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            >
                                <option value="ALL">所有状态</option>
                                <option value="ACTIVE">在逃</option>
                                <option value="CAPTURED">已抓获</option>
                                <option value="DECEASED">已死亡</option>
                                <option value="REMOVED">已移除</option>
                            </select>

                            <select
                                value={dangerFilter}
                                onChange={(e) => setDangerFilter(e.target.value)}
                                className="px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            >
                                <option value="ALL">所有危险等级</option>
                                <option value="LOW">低危险</option>
                                <option value="MEDIUM">中等危险</option>
                                <option value="HIGH">高危险</option>
                                <option value="EXTREME">极度危险</option>
                            </select>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-4">
                            <motion.button
                                onClick={() => handleBatchDelete({ status: 'DECEASED' }, '确定要删除所有已死亡的通缉犯记录吗？此操作不可逆！')}
                                className="flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-yellow-500 to-orange-600 text-white rounded-xl hover:from-yellow-600 hover:to-orange-700 transition-all duration-200 font-semibold"
                                whileHover={hoverScale(1.02)}
                                whileTap={tapScale(0.98)}
                            >
                                <FaTrash />
                                <span>删除死亡记录</span>
                            </motion.button>
                            <motion.button
                                onClick={() => handleBatchDelete({}, '警告：确定要删除所有的通缉犯记录吗？此操作将清空数据库，不可逆！')}
                                className="flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-red-600 to-pink-700 text-white rounded-xl hover:from-red-700 hover:to-pink-800 transition-all duration-200 font-semibold"
                                whileHover={hoverScale(1.02)}
                                whileTap={tapScale(0.98)}
                            >
                                <FaExclamationTriangle />
                                <span>删除所有记录</span>
                            </motion.button>
                            <motion.button
                                onClick={() => setShowCreateModal(true)}
                                className="flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl hover:from-blue-700 hover:to-purple-700 transition-all duration-200 font-semibold"
                                whileHover={hoverScale(1.02)}
                                whileTap={tapScale(0.98)}
                            >
                                <FaPlus />
                                <span>添加通缉犯</span>
                            </motion.button>
                        </div>
                    </div>
                </motion.div>

                {/* 通缉犯列表 */}
                <motion.div
                    className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 overflow-hidden"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.2 }}
                >
                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <FaSpinner className="animate-spin text-4xl text-blue-600" />
                            <span className="ml-3 text-lg text-gray-600">加载中...</span>
                        </div>
                    ) : (
                        <>
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                通缉犯信息
                                            </th>
                                            <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                危险等级
                                            </th>
                                            <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                状态
                                            </th>
                                            <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                悬赏金额
                                            </th>
                                            <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                操作
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {wantedList.map((wanted) => (
                                            <tr key={wanted._id} className="hover:bg-gray-50">
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="flex items-center">
                                                        <div className="flex-shrink-0 h-12 w-12">
                                                            {wanted.photoUrl ? (
                                                                <img
                                                                    className="h-12 w-12 rounded-full object-cover"
                                                                    src={wanted.photoUrl}
                                                                    alt={wanted.name}
                                                                />
                                                            ) : (
                                                                <div className="h-12 w-12 rounded-full bg-gray-300 flex items-center justify-center">
                                                                    <FaUserSecret className="text-gray-600" />
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="ml-4">
                                                            <div className="text-sm font-medium text-gray-900">
                                                                {wanted.name}
                                                            </div>
                                                            <div className="text-sm text-gray-500">
                                                                FBI: {wanted.fbiNumber}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getDangerLevelColor(wanted.dangerLevel)}`}>
                                                        {wanted.dangerLevel}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(wanted.status)}`}>
                                                        {wanted.status}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                    ${wanted.reward.toLocaleString()}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                                                    <motion.button
                                                        onClick={() => {
                                                            setSelectedWanted(wanted);
                                                            setShowViewModal(true);
                                                        }}
                                                        className="text-blue-600 hover:text-blue-900 transition-colors"
                                                        whileHover={hoverScale(1.1)}
                                                        whileTap={tapScale(0.95)}
                                                    >
                                                        <FaEye />
                                                    </motion.button>
                                                    <motion.button
                                                        onClick={() => {
                                                            setSelectedWanted(wanted);
                                                            setFormData(wanted);
                                                            setShowEditModal(true);
                                                        }}
                                                        className="text-green-600 hover:text-green-900 transition-colors"
                                                        whileHover={hoverScale(1.1)}
                                                        whileTap={tapScale(0.95)}
                                                    >
                                                        <FaEdit />
                                                    </motion.button>
                                                    <motion.button
                                                        onClick={() => {
                                                            if (confirm('确定要删除这个通缉犯记录吗？')) {
                                                                handleDeleteWanted(wanted._id);
                                                            }
                                                        }}
                                                        className="text-red-600 hover:text-red-900 transition-colors"
                                                        whileHover={hoverScale(1.1)}
                                                        whileTap={tapScale(0.95)}
                                                    >
                                                        <FaTrash />
                                                    </motion.button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* 分页 */}
                            {totalPages > 1 && (
                                <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
                                    <div className="flex items-center justify-between">
                                        <div className="text-sm text-gray-700">
                                            第 {currentPage} 页，共 {totalPages} 页
                                        </div>
                                        <div className="flex space-x-2">
                                            <button
                                                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                                                disabled={currentPage === 1}
                                                className="px-3 py-1 border border-gray-300 rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
                                            >
                                                上一页
                                            </button>
                                            <button
                                                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                                                disabled={currentPage === totalPages}
                                                className="px-3 py-1 border border-gray-300 rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
                                            >
                                                下一页
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </motion.div>

                {/* 创建通缉犯模态框 */}
                <AnimatePresence>
                    {showCreateModal && (
                        <motion.div
                            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                        >
                            <motion.div
                                className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
                                initial={{ scale: 0.9, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.9, opacity: 0 }}
                            >
                                <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6 rounded-t-2xl">
                                    <div className="flex items-center justify-between">
                                        <h2 className="text-2xl font-bold">添加通缉犯</h2>
                                        <button
                                            onClick={() => {
                                                setShowCreateModal(false);
                                                setFormData({});
                                            }}
                                            className="text-white hover:text-gray-200 transition-colors"
                                        >
                                            <FaTimes size={24} />
                                        </button>
                                    </div>
                                </div>

                                <div className="p-6 space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">姓名 *</label>
                                            <input
                                                type="text"
                                                value={formData.name || ''}
                                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                placeholder="输入通缉犯姓名"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">年龄</label>
                                            <input
                                                type="number"
                                                value={formData.age || ''}
                                                onChange={(e) => setFormData({ ...formData, age: parseInt(e.target.value) || 0 })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                placeholder="输入年龄"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">身高</label>
                                            <input
                                                type="text"
                                                value={formData.height || ''}
                                                onChange={(e) => setFormData({ ...formData, height: e.target.value })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                placeholder="例如：180cm 或 未知"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">体重</label>
                                            <input
                                                type="text"
                                                value={formData.weight || ''}
                                                onChange={(e) => setFormData({ ...formData, weight: e.target.value })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                placeholder="例如：75kg 或 未知"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">眼睛颜色</label>
                                            <input
                                                type="text"
                                                value={formData.eyes || ''}
                                                onChange={(e) => setFormData({ ...formData, eyes: e.target.value })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                placeholder="例如：棕色/蓝色/未知"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">头发颜色</label>
                                            <input
                                                type="text"
                                                value={formData.hair || ''}
                                                onChange={(e) => setFormData({ ...formData, hair: e.target.value })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                placeholder="例如：黑色/金色/未知"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">种族</label>
                                            <input
                                                type="text"
                                                value={formData.race || ''}
                                                onChange={(e) => setFormData({ ...formData, race: e.target.value })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                placeholder="例如：亚洲人/白人/未知"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">国籍</label>
                                            <input
                                                type="text"
                                                value={formData.nationality || ''}
                                                onChange={(e) => setFormData({ ...formData, nationality: e.target.value })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                placeholder="例如：中国/美国/未知"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">危险等级 *</label>
                                            <select
                                                value={formData.dangerLevel || 'LOW'}
                                                onChange={(e) => setFormData({ ...formData, dangerLevel: e.target.value as any })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            >
                                                <option value="LOW">低危险</option>
                                                <option value="MEDIUM">中等危险</option>
                                                <option value="HIGH">高危险</option>
                                                <option value="EXTREME">极度危险</option>
                                            </select>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">状态</label>
                                            <select
                                                value={formData.status || 'ACTIVE'}
                                                onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            >
                                                <option value="ACTIVE">在逃</option>
                                                <option value="CAPTURED">已抓获</option>
                                                <option value="DECEASED">已死亡</option>
                                                <option value="REMOVED">已移除</option>
                                            </select>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">奖金 ($)</label>
                                            <input
                                                type="number"
                                                value={formData.reward || ''}
                                                onChange={(e) => setFormData({ ...formData, reward: parseInt(e.target.value) || 0 })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                placeholder="输入奖金金额"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">罪名</label>
                                        <input
                                            type="text"
                                            value={formData.charges?.join(', ') || ''}
                                            onChange={(e) => setFormData({
                                                ...formData,
                                                charges: e.target.value
                                                    .split(',')
                                                    .map(s => s.trim())
                                                    .filter(s => s.length > 0)
                                            })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            placeholder="输入罪名，多个罪名用逗号分隔"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">描述</label>
                                        <textarea
                                            value={formData.description || ''}
                                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                            rows={3}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            placeholder="输入详细描述"
                                        />
                                    </div>

                                    {/* 图片上传区域 */}
                                    <ImageUploadSection
                                        photoPreview={photoPreview}
                                        pendingPhoto={pendingPhoto}
                                        photoUrl={formData.photoUrl || ''}
                                        loading={loading}
                                        onImageUpload={handleImageUpload}
                                        onUrlChange={(url) => setFormData({ ...formData, photoUrl: url })}
                                        onPreviewChange={(url) => setPhotoPreview(url)}
                                    />
                                </div>

                                <div className="px-6 py-4 bg-gray-50 rounded-b-2xl flex justify-end space-x-3">
                                    <button
                                        onClick={() => {
                                            setShowCreateModal(false);
                                            resetForm();
                                        }}
                                        className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
                                    >
                                        取消
                                    </button>
                                    <button
                                        onClick={handleCreateWanted}
                                        disabled={
                                            loading ||
                                            !formData.name ||
                                            !(formData.charges && formData.charges.length > 0) ||
                                            !(typeof formData.reward === 'number' && formData.reward >= 0)
                                        }
                                        className="px-6 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center gap-2"
                                    >
                                        {loading ? <FaSpinner className="animate-spin" /> : <FaSave />}
                                        {loading ? '创建中...' : '创建'}
                                    </button>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* 编辑通缉犯模态框 */}
                <AnimatePresence>
                    {showEditModal && selectedWanted && (
                        <motion.div
                            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                        >
                            <motion.div
                                className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
                                initial={{ scale: 0.9, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.9, opacity: 0 }}
                            >
                                <div className="bg-gradient-to-r from-green-600 to-blue-600 text-white p-6 rounded-t-2xl">
                                    <div className="flex items-center justify-between">
                                        <h2 className="text-2xl font-bold">编辑通缉犯</h2>
                                        <button
                                            onClick={() => {
                                                setShowEditModal(false);
                                                setSelectedWanted(null);
                                                setFormData({});
                                            }}
                                            className="text-white hover:text-gray-200 transition-colors"
                                        >
                                            <FaTimes size={24} />
                                        </button>
                                    </div>
                                </div>

                                <div className="p-6 space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">姓名 *</label>
                                            <input
                                                type="text"
                                                value={formData.name || ''}
                                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                placeholder="输入通缉犯姓名"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">年龄</label>
                                            <input
                                                type="number"
                                                value={formData.age || ''}
                                                onChange={(e) => setFormData({ ...formData, age: parseInt(e.target.value) || 0 })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                placeholder="输入年龄"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">危险等级 *</label>
                                            <select
                                                value={formData.dangerLevel || 'LOW'}
                                                onChange={(e) => setFormData({ ...formData, dangerLevel: e.target.value as any })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            >
                                                <option value="LOW">低危险</option>
                                                <option value="MEDIUM">中等危险</option>
                                                <option value="HIGH">高危险</option>
                                                <option value="EXTREME">极度危险</option>
                                            </select>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">状态</label>
                                            <select
                                                value={formData.status || 'ACTIVE'}
                                                onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            >
                                                <option value="ACTIVE">在逃</option>
                                                <option value="CAPTURED">已抓获</option>
                                                <option value="DECEASED">已死亡</option>
                                                <option value="REMOVED">已移除</option>
                                            </select>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">奖金 ($)</label>
                                            <input
                                                type="number"
                                                value={formData.reward || ''}
                                                onChange={(e) => setFormData({ ...formData, reward: parseInt(e.target.value) || 0 })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                placeholder="输入奖金金额"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">罪名</label>
                                        <input
                                            type="text"
                                            value={formData.charges?.join(', ') || ''}
                                            onChange={(e) => setFormData({ ...formData, charges: e.target.value.split(',').map(s => s.trim()) })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            placeholder="输入罪名，多个罪名用逗号分隔"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">描述</label>
                                        <textarea
                                            value={formData.description || ''}
                                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                            rows={3}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            placeholder="输入详细描述"
                                        />
                                    </div>
                                </div>

                                <div className="px-6 py-4 bg-gray-50 rounded-b-2xl flex justify-end space-x-3">
                                    <button
                                        onClick={() => {
                                            setShowEditModal(false);
                                            setSelectedWanted(null);
                                            setFormData({});
                                        }}
                                        className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
                                    >
                                        取消
                                    </button>
                                    <button
                                        onClick={handleUpdateWanted}
                                        disabled={loading || !formData.name || !formData.fbiNumber}
                                        className="px-6 py-2 bg-gradient-to-r from-green-600 to-blue-600 text-white rounded-lg hover:from-green-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center gap-2"
                                    >
                                        {loading ? <FaSpinner className="animate-spin" /> : <FaSave />}
                                        {loading ? '更新中...' : '更新'}
                                    </button>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* 查看通缉犯详情模态框 */}
                <AnimatePresence>
                    {showViewModal && selectedWanted && (
                        <motion.div
                            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                        >
                            <motion.div
                                className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
                                initial={{ scale: 0.9, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.9, opacity: 0 }}
                            >
                                <div className="bg-gradient-to-r from-red-600 to-orange-600 text-white p-6 rounded-t-2xl">
                                    <div className="flex items-center justify-between">
                                        <h2 className="text-2xl font-bold">通缉犯详情</h2>
                                        <button
                                            onClick={() => {
                                                setShowViewModal(false);
                                                setSelectedWanted(null);
                                            }}
                                            className="text-white hover:text-gray-200 transition-colors"
                                        >
                                            <FaTimes size={24} />
                                        </button>
                                    </div>
                                </div>

                                <div className="p-6 space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">姓名</label>
                                            <p className="text-lg font-semibold">{selectedWanted?.name}</p>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">FBI编号</label>
                                            <p className="text-lg">{selectedWanted?.fbiNumber}</p>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">年龄</label>
                                            <p className="text-lg">{selectedWanted?.age || '未知'}</p>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">身高</label>
                                            <p className="text-lg">{selectedWanted?.height || '未知'}</p>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">体重</label>
                                            <p className="text-lg">{selectedWanted?.weight || '未知'}</p>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">眼睛颜色</label>
                                            <p className="text-lg">{selectedWanted?.eyes || '未知'}</p>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">头发颜色</label>
                                            <p className="text-lg">{selectedWanted?.hair || '未知'}</p>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">种族</label>
                                            <p className="text-lg">{selectedWanted?.race || '未知'}</p>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">国籍</label>
                                            <p className="text-lg">{selectedWanted?.nationality || '未知'}</p>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">危险等级</label>
                                            <span className={`inline-flex px-3 py-1 text-sm font-semibold rounded-full ${getDangerLevelColor(selectedWanted?.dangerLevel || '')}`}>
                                                {selectedWanted?.dangerLevel}
                                            </span>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">状态</label>
                                            <span className={`inline-flex px-3 py-1 text-sm font-semibold rounded-full ${getStatusColor(selectedWanted?.status || '')}`}>
                                                {selectedWanted?.status}
                                            </span>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">奖金</label>
                                            <p className="text-lg font-semibold text-green-600">${(selectedWanted?.reward || 0).toLocaleString()}</p>
                                        </div>
                                    </div>

                                    {selectedWanted?.charges && selectedWanted.charges.length > 0 && (
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">罪名</label>
                                            <div className="flex flex-wrap gap-2">
                                                {selectedWanted.charges.map((charge, index) => (
                                                    <span key={index} className="px-2 py-1 bg-red-100 text-red-800 rounded-lg text-sm">
                                                        {charge}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {selectedWanted?.description && (
                                        <div className="mt-4 pt-4 border-t">
                                            <label className="block text-sm font-medium text-gray-700 mb-1">描述</label>
                                            <p className="text-gray-800 bg-gray-50 p-3 rounded-lg">{selectedWanted.description}</p>
                                        </div>
                                    )}

                                    <div className="mt-4 pt-4 border-t grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">FBI 编号</label>
                                            <p className="text-gray-800 font-mono bg-gray-100 p-2 rounded">{selectedWanted?.fbiNumber}</p>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">NCIC 编号</label>
                                            <p className="text-gray-800 font-mono bg-gray-100 p-2 rounded">{selectedWanted?.ncicNumber || 'N/A'}</p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">身高</label>
                                            <p className="text-gray-800">{selectedWanted?.height || '未知'}</p>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">体重</label>
                                            <p className="text-gray-800">{selectedWanted?.weight || '未知'}</p>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">眼睛颜色</label>
                                            <p className="text-gray-800">{selectedWanted?.eyes || '未知'}</p>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">头发颜色</label>
                                            <p className="text-gray-800">{selectedWanted?.hair || '未知'}</p>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">种族</label>
                                            <p className="text-gray-800">{selectedWanted?.race || '未知'}</p>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">国籍</label>
                                            <p className="text-gray-800">{selectedWanted?.nationality || '未知'}</p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
                                        <div>
                                            <label className="block font-medium mb-1">添加时间</label>
                                            <p>{new Date(selectedWanted?.dateAdded || '').toLocaleString()}</p>
                                        </div>

                                        <div>
                                            <label className="block font-medium mb-1">最后更新</label>
                                            <p>{new Date(selectedWanted?.lastUpdated || '').toLocaleString()}</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="px-6 py-4 bg-gray-50 rounded-b-2xl flex justify-end">
                                    <button
                                        onClick={() => {
                                            setShowViewModal(false);
                                            setSelectedWanted(null);
                                        }}
                                        className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                                    >
                                        关闭
                                    </button>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};

export default FBIWantedManager;
