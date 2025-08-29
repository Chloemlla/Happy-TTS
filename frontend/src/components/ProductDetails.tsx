import React from 'react';
import { motion } from 'framer-motion';
import { FaExclamationTriangle } from 'react-icons/fa';
import { ProductInfo } from '../types/anta';

interface ProductDetailsProps {
  product: {
    barcode: string;
    itemNumber: string;
    ean: string;
    size: string;
    productName?: string;
    brand?: string;
    category?: string;
    color?: string;
    material?: string;
    retailPrice?: number;
  };
  queryCount: number;
  isVerified?: boolean; // true for success (green), false for failure (red)
}

const ProductDetails: React.FC<ProductDetailsProps> = ({ product, queryCount, isVerified = true }) => {
  // 动画变体
  const containerVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        type: "spring" as const,
        stiffness: 100,
        damping: 20,
        staggerChildren: 0.1,
        delayChildren: 0.1
      }
    }
  };

  const cardVariants = {
    hidden: {
      opacity: 0,
      y: 40,
      scale: 0.9,
      rotateX: 15
    },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      rotateX: 0,
      transition: {
        type: "spring" as const,
        stiffness: 100,
        damping: 20,
        mass: 0.8
      }
    }
  };

  const itemVariants = {
    hidden: {
      opacity: 0,
      x: -30,
      scale: 0.9
    },
    visible: (custom: number) => ({
      opacity: 1,
      x: 0,
      scale: 1,
      transition: {
        type: "spring" as const,
        stiffness: 120,
        damping: 20,
        delay: custom * 0.1
      }
    })
  };

  const badgeVariants = {
    hidden: {
      opacity: 0,
      scale: 0.6,
      y: -20
    },
    visible: {
      opacity: 1,
      scale: 1,
      y: 0,
      transition: {
        type: "spring" as const,
        stiffness: 200,
        damping: 15,
        delay: 0.3
      }
    }
  };

  // 产品信息字段配置
  const productFields = [
    { label: '条码', value: product.barcode, icon: '📊' },
    { label: '货号', value: product.itemNumber, icon: '🔢' },
    { label: 'EAN码', value: product.ean, icon: '📋' },
    { label: '尺码', value: product.size, icon: '📏' },
    { label: '品名', value: product.productName || '未知', icon: '👟' },
    { label: '品牌', value: product.brand || 'Anta', icon: '🏷️' },
    { label: '价格', value: product.retailPrice ? `¥${product.retailPrice.toFixed(2)}` : '未知', icon: '💰' }
  ];

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="w-full max-w-4xl mx-auto"
    >
      {/* 验证状态标识 */}
      <motion.div variants={cardVariants} className="mb-8">
        <div className={`rounded-2xl p-8 text-white shadow-2xl relative overflow-hidden ${isVerified
          ? 'bg-gradient-to-r from-green-500 via-green-600 to-green-700'
          : 'bg-gradient-to-r from-red-500 via-red-600 to-red-700'
          }`}>
          {/* 背景装饰 */}
          <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent"></div>
          <div className="absolute -top-4 -right-4 w-24 h-24 bg-white/10 rounded-full blur-xl"></div>
          <div className="absolute -bottom-4 -left-4 w-32 h-32 bg-white/5 rounded-full blur-2xl"></div>

          <div className="relative flex flex-col sm:flex-row items-center justify-center">
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{
                type: "spring" as const,
                stiffness: 200,
                damping: 15,
                delay: 0.2
              }}
              className="w-20 h-20 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center mb-4 sm:mb-0 sm:mr-6 ring-4 ring-white/30 shadow-xl"
            >
              <svg className="w-10 h-10 drop-shadow-lg" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </motion.div>
            <div className="text-center sm:text-left">
              <motion.h2
                className="text-3xl sm:text-4xl font-bold mb-2 drop-shadow-lg"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
              >
                {isVerified ? '验证成功' : '验证失败'}
              </motion.h2>
              <motion.p
                className={`text-lg font-medium ${isVerified ? 'text-green-100' : 'text-red-100'
                  }`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
              >
                {isVerified ? '该产品为安踏正品' : '该产品验证失败，请谨慎购买'}
              </motion.p>
              <motion.div
                className="flex items-center justify-center sm:justify-start mt-3 space-x-2"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8 }}
              >
                <motion.div
                  className="w-3 h-3 bg-white rounded-full"
                  animate={{
                    scale: [1, 1.3, 1],
                    opacity: [1, 0.7, 1]
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: "easeInOut"
                  }}
                />
                <span className={`text-sm font-medium ${isVerified ? 'text-green-100' : 'text-red-100'
                  }`}>
                  {isVerified ? '官方认证通过' : '认证未通过'}
                </span>
              </motion.div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* 产品详情卡片 */}
      <motion.div variants={cardVariants} className="bg-gradient-to-br from-white to-blue-50/30 backdrop-blur-sm rounded-2xl shadow-2xl overflow-hidden border border-blue-200/50">
        {/* 卡片头部 */}
        <div className="bg-gradient-to-r from-blue-50 via-blue-100/50 to-blue-50 px-8 py-6 border-b border-blue-200">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between space-y-3 sm:space-y-0">
            <div className="flex items-center">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center mr-3 shadow-lg">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold bg-gradient-to-r from-blue-700 to-blue-800 bg-clip-text text-transparent">产品详情</h3>
            </div>
            <motion.div variants={badgeVariants} className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center px-4 py-2 text-sm font-semibold rounded-full shadow-sm ${isVerified
                ? 'bg-gradient-to-r from-green-100 to-green-200 text-green-800 border border-green-300'
                : 'bg-gradient-to-r from-red-100 to-red-200 text-red-800 border border-red-300'
                }`}>
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {isVerified ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  )}
                </svg>
                {isVerified ? '正品验证' : '验证失败'}
              </span>
              <span className={`inline-flex items-center px-4 py-2 text-sm font-semibold rounded-full shadow-sm ${queryCount > 1
                ? 'bg-gradient-to-r from-yellow-100 to-orange-100 text-yellow-800 border border-yellow-300'
                : 'bg-gradient-to-r from-white to-blue-50 text-blue-700 border border-blue-200'
                }`}>
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {queryCount > 1 ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  )}
                </svg>
                查询次数: {queryCount}
                {queryCount > 1 && <FaExclamationTriangle className="ml-1 w-3 h-3" />}
              </span>
            </motion.div>
          </div>
        </div>

        {/* 产品信息网格 */}
        <div className="p-8">
          <motion.div
            className="grid grid-cols-1 md:grid-cols-2 gap-6"
            variants={{
              visible: {
                transition: {
                  staggerChildren: 0.1
                }
              }
            }}
          >
            {productFields.map((field, index) => (
              <motion.div
                key={field.label}
                variants={itemVariants}
                custom={index}
                whileHover={{
                  scale: 1.03,
                  y: -4,
                  rotateY: 2,
                  transition: { type: "spring", stiffness: 400, damping: 10 }
                }}
                whileTap={{ scale: 0.98 }}
                className="group bg-gradient-to-br from-white via-blue-50/30 to-white rounded-xl p-6 border border-blue-200 hover:border-blue-400 hover:shadow-xl hover:shadow-blue-100/50 transition-all duration-300 cursor-pointer relative overflow-hidden"
              >
                {/* 背景装饰 */}
                <motion.div
                  className="absolute inset-0 bg-gradient-to-br from-blue-50/0 to-blue-100/60"
                  initial={{ opacity: 0, scale: 0.8 }}
                  whileHover={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3 }}
                />
                <motion.div
                  className="absolute -top-2 -right-2 w-8 h-8 bg-blue-300/40 rounded-full blur-sm"
                  animate={{
                    scale: [1, 1.2, 1],
                    opacity: [0.3, 0.6, 0.3]
                  }}
                  transition={{
                    duration: 3,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: index * 0.2
                  }}
                />

                <div className="relative flex items-center">
                  <motion.div
                    className="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-blue-100 to-blue-200 rounded-xl flex items-center justify-center mr-4 shadow-lg group-hover:shadow-xl transition-shadow duration-300"
                    whileHover={{
                      rotate: 10,
                      scale: 1.1
                    }}
                    animate={{
                      y: [0, -2, 0]
                    }}
                    transition={{
                      y: {
                        duration: 2,
                        repeat: Infinity,
                        ease: "easeInOut",
                        delay: index * 0.1
                      }
                    }}
                  >
                    <span className="text-2xl" role="img" aria-label={field.label}>
                      {field.icon}
                    </span>
                  </motion.div>
                  <div className="flex-1 min-w-0">
                    <dt className="text-sm font-semibold text-blue-600 mb-2 uppercase tracking-wide">
                      {field.label}
                    </dt>
                    <dd className="text-lg font-bold text-blue-900 break-all group-hover:text-blue-700 transition-colors duration-300">
                      {field.value}
                    </dd>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>

        {/* 查询统计信息 */}
        <motion.div variants={itemVariants} className="bg-gradient-to-r from-blue-50 via-blue-100/50 to-blue-50 px-8 py-6 border-t border-blue-200">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between space-y-3 sm:space-y-0">
            <div className="flex items-center text-blue-700">
              <motion.div
                className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center mr-3 shadow-lg"
                animate={{ rotate: [0, 5, -5, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              >
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </motion.div>
              <div>
                <span className="text-sm font-semibold block">
                  该产品已被查询 <span className="text-lg font-bold text-blue-800">{queryCount}</span> 次
                </span>
                <span className="text-xs text-blue-600">
                  查询时间: {new Date().toLocaleString('zh-CN')}
                </span>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-xs font-medium text-blue-600">实时数据</span>
            </div>
          </div>

          {/* 高查询次数警告 */}
          {queryCount > 1 && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 0.3, type: "spring", stiffness: 300 }}
              className="mt-4 p-4 bg-gradient-to-r from-yellow-50 via-orange-50 to-yellow-50 border border-yellow-200 rounded-xl shadow-sm"
            >
              <div className="flex items-start space-x-3">
                <motion.div
                  className="flex-shrink-0 w-8 h-8 bg-gradient-to-br from-yellow-500 to-orange-500 rounded-lg flex items-center justify-center shadow-md"
                  animate={{
                    scale: [1, 1.1, 1],
                    rotate: [0, 5, -5, 0]
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: "easeInOut"
                  }}
                >
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                </motion.div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-yellow-800 mb-1">
                    ⚠️ 高频查询警告
                  </p>
                  <p className="text-xs text-yellow-700 leading-relaxed">
                    该产品查询次数较多，可能存在假冒风险。建议通过安踏官方渠道购买，或前往官方授权店铺验证。
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                      <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      谨慎购买
                    </span>
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                      <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      官方验证
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </motion.div>

        {/* 页脚链接 */}
        <motion.div variants={itemVariants} className="bg-gradient-to-r from-blue-50/50 to-white px-8 py-6 border-t border-blue-200">
          <div className="flex flex-col sm:flex-row items-center justify-between space-y-4 sm:space-y-0">
            <div className="flex flex-wrap items-center gap-4">
              <motion.a
                whileHover={{ scale: 1.05, y: -2 }}
                whileTap={{ scale: 0.95 }}
                href="https://www.anta.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl hover:from-blue-700 hover:to-blue-800 transition-all duration-300 shadow-lg hover:shadow-xl font-medium"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                安踏官网
              </motion.a>
              <motion.a
                whileHover={{ scale: 1.05, y: -2 }}
                whileTap={{ scale: 0.95 }}
                href="/policy"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center px-4 py-2 bg-white text-blue-700 border border-blue-300 rounded-xl hover:bg-blue-50 hover:border-blue-400 transition-all duration-300 shadow-lg hover:shadow-xl font-medium"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                隐私条款
              </motion.a>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
              <span className="text-sm font-medium text-blue-600">
                数据来源：安踏官方API
              </span>
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* 免责声明 */}
      <motion.div variants={itemVariants} className="mt-8 text-center">
        <div className="bg-gradient-to-r from-blue-50 via-white to-blue-50 border border-blue-200 rounded-2xl p-6 shadow-lg backdrop-blur-sm">
          <div className="flex items-start justify-center">
            <motion.div
              className="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center mr-4 shadow-lg"
              animate={{ rotate: [0, 5, -5, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            >
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </motion.div>
            <div className="text-left">
              <p className="font-bold text-lg text-blue-800 mb-3">免责声明</p>
              <p className="text-blue-700 leading-relaxed">
                本查询结果仅供参考，产品真伪最终解释权归安踏体育用品有限公司所有。
                如有疑问，请联系安踏官方客服或前往安踏官方授权店铺咨询。
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                  仅供参考
                </span>
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-200 text-blue-800">
                  <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  官方解释权
                </span>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default ProductDetails;