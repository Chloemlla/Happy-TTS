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

  const [birthYear, setBirthYear] = useState(currentYear - 30);
  const [birthMonth, setBirthMonth] = useState(new Date().getMonth() + 1);
  const [birthDay, setBirthDay] = useState(1);
  const [endDate, setEndDate] = useState<Date>(new Date());

  const [ageResult, setAgeResult] = useState<AgeResult | null>(null);

  const [error, submitAction, isCalculating] = useActionState(
    async (previousState: string | null, formData: FormData) => {
      const year = parseInt(formData.get('birthYear') as string);
      const month = parseInt(formData.get('birthMonth') as string);
      const day = parseInt(formData.get('birthDay') as string);
      const endDateString = formData.get('endDate') as string;

      try {
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

  useEffect(() => {
    document.title = ageResult
      ? `年龄计算器 - ${ageResult.exactAge.years}岁 | 在线工具`
      : '在线年龄计算器 - 精准计算日期差';

    const description = ageResult
      ? `年龄计算结果：${ageResult.exactAge.years}岁${ageResult.exactAge.months}个月${ageResult.exactAge.days}天，总计${ageResult.daysLived}天。免费在线年龄计算器，支持精确到天的日期计算。`
      : '免费在线年龄计算器，精确计算两个日期之间的年龄差。支持年月日详细计算，适用于各种年龄计算场景。';

    let metaDescription = document.querySelector('meta[name="description"]');
    if (!metaDescription) {
      metaDescription = document.createElement('meta');
      metaDescription.setAttribute('name', 'description');
      document.head.appendChild(metaDescription);
    }
    metaDescription.setAttribute('content', description);
  }, [ageResult]);

  const yearOptions = useMemo(() => {
    const years = [];
    for (let year = 1910; year <= currentYear + 10; year++) {
      years.push(year);
    }
    return years;
  }, [currentYear]);

  const monthOptions = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => i + 1);
  }, []);

  const dayOptions = useMemo(() => {
    const maxDays = getDaysInMonth(birthYear, birthMonth);
    return Array.from({ length: maxDays }, (_, i) => i + 1);
  }, [birthYear, birthMonth]);

  const updateDayIfNeeded = useCallback(() => {
    const maxDays = getDaysInMonth(birthYear, birthMonth);
    if (birthDay > maxDays) {
      setBirthDay(maxDays);
    }
  }, [birthYear, birthMonth, birthDay]);

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

  const formatDateForInput = (date: Date): string => {
    return date.toISOString().split('T')[0];
  };

  const SELECT_CLASS =
    'w-full appearance-none rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-slate-900 transition focus:border-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-300';

  const ResultBox: React.FC<{
    icon: React.ComponentType<{ className?: string }>;
    title: string;
    children: React.ReactNode;
    delay: number;
  }> = ({ icon: Icon, title, children, delay }) => (
    <motion.div
      className="relative overflow-hidden rounded-[24px] border border-white/70 bg-white/82 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.06)] backdrop-blur-xl"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay }}
    >
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.26em] text-slate-400">
        <Icon className="text-slate-500" />
        {title}
      </div>
      <div className="mt-3 text-sm leading-7 text-slate-700">{children}</div>
    </motion.div>
  );

  return (
    <section className="mx-auto max-w-5xl px-4 py-10 sm:py-12">
      <motion.div
        className="relative overflow-hidden rounded-[34px] border border-white/70 bg-white/88 p-6 shadow-[0_28px_110px_rgba(15,23,42,0.1)] backdrop-blur-xl sm:p-10"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="pointer-events-none absolute -right-16 top-0 h-48 w-48 rounded-full bg-[radial-gradient(circle,_rgba(59,130,246,0.22),_transparent_68%)]" />
        <div className="pointer-events-none absolute -left-10 bottom-0 h-40 w-40 rounded-full bg-[radial-gradient(circle,_rgba(14,165,233,0.16),_transparent_70%)]" />

        <div className="relative">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
            <FaCalculator className="text-[10px]" /> Age Calculator
          </div>
          <h1 className="mt-5 text-3xl font-semibold leading-tight text-slate-900 sm:text-4xl">
            年龄生肖计算器
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
            在线计算精确年龄、周岁、虚岁、生肖与星座，支持自定义截止日期与农历推算。
          </p>

          <div className="mt-8 space-y-6">
            <div>
              <label className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                <FaBirthdayCake className="text-slate-500" />
                出生日期
              </label>
              <div className="mt-2 grid grid-cols-3 gap-3">
                <select
                  value={birthYear}
                  onChange={(e) => handleYearChange(Number(e.target.value))}
                  className={SELECT_CLASS}
                >
                  {yearOptions.map(year => (
                    <option key={year} value={year}>{year}年</option>
                  ))}
                </select>
                <select
                  value={birthMonth}
                  onChange={(e) => handleMonthChange(Number(e.target.value))}
                  className={SELECT_CLASS}
                >
                  {monthOptions.map(month => (
                    <option key={month} value={month}>{month}月</option>
                  ))}
                </select>
                <select
                  value={birthDay}
                  onChange={(e) => setBirthDay(Number(e.target.value))}
                  className={SELECT_CLASS}
                >
                  {dayOptions.map(day => (
                    <option key={day} value={day}>{day}日</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                <FaCalendarCheck className="text-slate-500" />
                截止日期
                <span className="ml-1 normal-case tracking-normal text-slate-400">(默认今日)</span>
              </label>
              <input
                type="date"
                value={formatDateForInput(endDate)}
                onChange={(e) => handleEndDateChange(e.target.value)}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-slate-900 transition focus:border-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-300"
              />
            </div>

            <div className="pt-2">
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
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 sm:w-auto"
                whileHover={{ scale: !isCalculating ? 1.01 : 1 }}
                whileTap={{ scale: !isCalculating ? 0.99 : 1 }}
              >
                {isCalculating ? (
                  <>
                    <motion.div
                      className="h-4 w-4 rounded-full border-2 border-white border-t-transparent"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    />
                    <span>计算中…</span>
                  </>
                ) : (
                  <>
                    <span>计算年龄</span>
                    <FaArrowRight className="text-[12px]" />
                  </>
                )}
              </motion.button>
            </div>
          </div>

          <AnimatePresence>
            {error && (
              <motion.div
                className="mt-6 rounded-[22px] border border-rose-200/70 bg-rose-50/80 px-5 py-4 text-sm leading-7 text-rose-700"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
              >
                <div className="text-[10px] font-semibold uppercase tracking-[0.26em] text-rose-500">
                  错误
                </div>
                <div className="mt-1">{error}</div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {ageResult && (
              <motion.div
                className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.5 }}
              >
                <ResultBox icon={FaUser} title="周岁信息" delay={0.05}>
                  <p className="text-base font-semibold text-slate-900">{ageResult.nominalAge} 岁</p>
                  <p className="mt-1 text-xs text-slate-500">{formatAgeResult(ageResult.exactAge)}</p>
                </ResultBox>
                <ResultBox icon={FaUserPlus} title="虚岁" delay={0.1}>
                  <p className="text-base font-semibold text-slate-900">{ageResult.traditionalAge} 岁</p>
                </ResultBox>
                <ResultBox icon={FaStar} title="星座 / 生肖" delay={0.15}>
                  <p>{ageResult.westernZodiac}</p>
                  <p className="mt-1 text-slate-500">{ageResult.chineseZodiac}</p>
                </ResultBox>
                <ResultBox icon={FaMoon} title="农历生日" delay={0.2}>
                  <p>{ageResult.lunarBirthDate}</p>
                </ResultBox>
                <ResultBox icon={FaCalendarAlt} title="下次农历生日" delay={0.25}>
                  <p>{ageResult.nextLunarBirthday}</p>
                </ResultBox>
                <ResultBox icon={FaGlobeAsia} title="在地球上" delay={0.3}>
                  <p>
                    已生活{' '}
                    <span className="text-base font-semibold text-slate-900">
                      {ageResult.daysLived.toLocaleString()}
                    </span>{' '}
                    天
                  </p>
                </ResultBox>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      <motion.div
        className="mt-6 flex items-center justify-center"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        <div className="inline-flex items-center gap-3 rounded-full border border-white/70 bg-white/88 px-5 py-2 shadow-[0_8px_24px_rgba(15,23,42,0.06)] backdrop-blur-xl">
          <div className="flex items-center gap-0.5 text-amber-400">
            {[...Array(4)].map((_, i) => (
              <FaStar key={i} className="text-[12px]" />
            ))}
            <FaStarHalfAlt className="text-[12px]" />
          </div>
          <span className="text-sm font-semibold text-slate-800">4.9 / 5</span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
            9,481 users
          </span>
        </div>
      </motion.div>
    </section>
  );
};

export default AgeCalculatorPage;
