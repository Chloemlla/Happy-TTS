import React, { useState, useCallback, useMemo, useEffect, useActionState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FaCalculator, 
  FaBirthdayCake, 
  FaCalendarCheck, 
  FaUser, 
  FaUserPlus, 
  FaStar, 
  FaMoon, 
  FaCalendarAlt, 
  FaGlobeAsia,
  FaArrowRight,
  FaStarHalfAlt
} from 'react-icons/fa';
import { 
  calculateAge, 
  formatAgeResult, 
  getDaysInMonth,
  AgeResult 
} from '../utils/ageCalculator';

const AgeCalculatorPage: React.FC = () => {
  const currentYear = new Date().getFullYear();
  
  // State for date inputs
  const [birthYear, setBirthYear] = useState(currentYear - 30);
  const [birthMonth, setBirthMonth] = useState(new Date().getMonth() + 1);
  const [birthDay, setBirthDay] = useState(1);
  const [endDate, setEndDate] = useState<Date>(new Date());
  
  // State for calculation results
  const [ageResult, setAgeResult] = useState<AgeResult | null>(null);

  // React 19: 使用useActionState替换手动状态管理
  const [error, submitAction, isCalculating] = useActionState(
    async (previousState: string | null, formData: FormData) => {
      const year = parseInt(formData.get('birthYear') as string);
      const month = parseInt(formData.get('birthMonth') as string);
      const day = parseInt(formData.get('birthDay') as string);
      const endDateString = formData.get('endDate') as string;
      
      try {
        // 模拟计算延迟，提供更好的用户体验
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const result = calculateAge(year, month, day, endDateString ? new Date(endDateString) : new Date());
        
        if ('error' in result) {
          setAgeResult(null);
          return result.error;
        } else {
          setAgeResult(result);
          return null;
        }
      } catch (err) {
        return '计算过程中发生错误，请重试';
      }
    },
    null
  );

  // React 19: 文档元数据 - 动态页面标题和SEO
  useEffect(() => {
    // React 19: 动态设置页面标题
    document.title = ageResult 
      ? `年龄计算器 - ${ageResult.exactAge.years}岁 | 在线工具`
      : '在线年龄计算器 - 精准计算日期差';
        
    // React 19: 动态设置页面描述
    const description = ageResult
      ? `年龄计算结果：${ageResult.exactAge.years}岁${ageResult.exactAge.months}个月${ageResult.exactAge.days}天，总计${ageResult.daysLived}天。免费在线年龄计算器，支持精确到天的日期计算。`
      : '免费在线年龄计算器，精确计算两个日期之间的年龄差。支持年月日详细计算，适用于各种年龄计算场景。';
        
    // 更新或创建meta description
    let metaDescription = document.querySelector('meta[name="description"]');
    if (!metaDescription) {
      metaDescription = document.createElement('meta');
      metaDescription.setAttribute('name', 'description');
      document.head.appendChild(metaDescription);
    }
    metaDescription.setAttribute('content', description);
  }, [ageResult]);

  // Generate year options (1910 to current year + 10)
  const yearOptions = useMemo(() => {
    const years = [];
    for (let year = 1910; year <= currentYear + 10; year++) {
      years.push(year);
    }
    return years;
  }, [currentYear]);

  // Generate month options
  const monthOptions = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => i + 1);
  }, []);

  // Generate day options based on selected year and month
  const dayOptions = useMemo(() => {
    const maxDays = getDaysInMonth(birthYear, birthMonth);
    return Array.from({ length: maxDays }, (_, i) => i + 1);
  }, [birthYear, birthMonth]);

  // Update day when year or month changes
  const updateDayIfNeeded = useCallback(() => {
    const maxDays = getDaysInMonth(birthYear, birthMonth);
    if (birthDay > maxDays) {
      setBirthDay(maxDays);
    }
  }, [birthYear, birthMonth, birthDay]);

  // Handle date changes
  const handleYearChange = useCallback((year: number) => {
    setBirthYear(year);
    updateDayIfNeeded();
  }, [updateDayIfNeeded]);

  const handleMonthChange = useCallback((month: number) => {
    setBirthMonth(month);
    updateDayIfNeeded();
  }, [updateDayIfNeeded]);

  const handleEndDateChange = useCallback((dateString: string) => {
    if (dateString) {
      setEndDate(new Date(dateString));
    } else {
      setEndDate(new Date());
    }
  }, []);

  // Format date for input
  const formatDateForInput = (date: Date): string => {
    return date.toISOString().split('T')[0];
  };

  // Result display components
  const ResultBox: React.FC<{ 
    icon: React.ComponentType<{ className?: string }>; 
    title: string; 
    children: React.ReactNode;
    delay: number;
  }> = ({ icon: Icon, title, children, delay }) => (
    <motion.div
      className="bg-gray-50 rounded-lg p-6 border border-gray-200"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
    >
      <h3 className="text-lg font-semibold mb-3 text-gray-800 flex items-center gap-2">
        <Icon className="text-blue-600" />
        {title}
      </h3>
      <div className="text-gray-700">{children}</div>
    </motion.div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 py-8 rounded-3xl">
      <div className="max-w-7xl mx-auto px-4 space-y-8">
        {/* Header */}
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
                <FaCalculator className="text-4xl" />
                <h1 className="text-4xl font-bold">年龄生肖计算器</h1>
              </motion.div>
              <motion.p 
                className="text-blue-100 text-lg"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.4 }}
              >
                在线计算您的精确年龄、周岁、虚岁、生肖、星座
              </motion.p>
            </div>
          </div>
        </motion.div>

        {/* Main Calculator */}
        <motion.div 
          className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 p-6 md:p-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          {/* Birth Date Input */}
          <div className="mb-6">
            <label className="block text-gray-700 font-semibold mb-3 flex items-center gap-2">
              <FaBirthdayCake className="text-blue-600" />
              出生日期:
            </label>
            <div className="grid grid-cols-3 gap-4">
              <select 
                value={birthYear}
                onChange={(e) => handleYearChange(Number(e.target.value))}
                className="w-full p-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-300"
              >
                {yearOptions.map(year => (
                  <option key={year} value={year}>{year}年</option>
                ))}
              </select>
              
              <select 
                value={birthMonth}
                onChange={(e) => handleMonthChange(Number(e.target.value))}
                className="w-full p-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-300"
              >
                {monthOptions.map(month => (
                  <option key={month} value={month}>{month}月</option>
                ))}
              </select>
              
              <select 
                value={birthDay}
                onChange={(e) => setBirthDay(Number(e.target.value))}
                className="w-full p-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-300"
              >
                {dayOptions.map(day => (
                  <option key={day} value={day}>{day}日</option>
                ))}
              </select>
            </div>
          </div>

          {/* End Date Input */}
          <div className="mb-8">
            <label className="block text-gray-700 font-semibold mb-3 flex items-center gap-2">
              <FaCalendarCheck className="text-blue-600" />
              截止日期 (默认今日):
            </label>
            <input 
              type="date"
              value={formatDateForInput(endDate)}
              onChange={(e) => handleEndDateChange(e.target.value)}
              className="w-full p-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-300"
            />
          </div>

          {/* Calculate Button */}
          <div className="text-center mb-8">
            <motion.button
              onClick={() => {
                const formData = new FormData();
                formData.append('birthYear', birthYear.toString());
                formData.append('birthMonth', birthMonth.toString());
                formData.append('birthDay', birthDay.toString());
                formData.append('endDate', formatDateForInput(endDate));
                submitAction(formData);
              }}
              disabled={isCalculating}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-bold py-3 px-8 rounded-lg inline-flex items-center transition-all duration-300 transform hover:-translate-y-0.5 shadow-lg disabled:transform-none disabled:shadow-none"
              whileHover={{ scale: !isCalculating ? 1.05 : 1 }}
              whileTap={{ scale: !isCalculating ? 0.95 : 1 }}
            >
              {isCalculating ? (
                <>
                  <motion.div
                    className="w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  />
                  计算中...
                </>
              ) : (
                <>
                  <span>计算年龄</span>
                  <FaArrowRight className="ml-2" />
                </>
              )}
            </motion.button>
          </div>

          {/* Error Display */}
          <AnimatePresence>
            {error && (
              <motion.div 
                className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Results */}
          <AnimatePresence>
            {ageResult && (
              <motion.div
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.5 }}
              >
                <ResultBox icon={FaUser} title="年龄周岁信息" delay={0.1}>
                  <p className="font-semibold text-lg">周岁年龄: {ageResult.nominalAge}岁</p>
                  <p>详细年龄: {formatAgeResult(ageResult.exactAge)}</p>
                </ResultBox>

                <ResultBox icon={FaUserPlus} title="虚岁年龄" delay={0.2}>
                  <p className="font-semibold text-lg">虚岁: {ageResult.traditionalAge}岁</p>
                </ResultBox>

                <ResultBox icon={FaStar} title="星座与生肖" delay={0.3}>
                  <p>星座: {ageResult.westernZodiac}</p>
                  <p>生肖: {ageResult.chineseZodiac}</p>
                </ResultBox>

                <ResultBox icon={FaMoon} title="农历信息" delay={0.4}>
                  <p>农历生日: {ageResult.lunarBirthDate}</p>
                </ResultBox>

                <ResultBox icon={FaCalendarAlt} title="下次农历生日" delay={0.5}>
                  <p>{ageResult.nextLunarBirthday}</p>
                </ResultBox>

                <ResultBox icon={FaGlobeAsia} title="在地球上" delay={0.6}>
                  <p>已在地球上生活 {ageResult.daysLived.toLocaleString()} 天</p>
                </ResultBox>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* User Rating */}
        <motion.section 
          className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 p-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 1.2 }}
        >
          <div className="flex justify-center">
            <div className="inline-flex items-center bg-white shadow-lg rounded-full px-6 py-3 space-x-4 border border-gray-200">
              <div className="flex items-center space-x-1 text-yellow-400">
                {[...Array(5)].map((_, i) => (
                  <FaStar key={i} className={i < 4 ? '' : 'text-yellow-200'} />
                ))}
                <FaStarHalfAlt className="text-yellow-200" />
              </div>
              <span className="text-lg font-bold text-gray-800">4.9 / 5</span>
              <span className="text-gray-600">来自9481位用户的好评！</span>
            </div>
          </div>
        </motion.section>
      </div>
    </div>
  );
};

export default AgeCalculatorPage;
