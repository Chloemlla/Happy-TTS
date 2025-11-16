// Age calculation utility functions
export interface AgeResult {
  exactAge: {
    years: number;
    months: number;
    days: number;
  };
  nominalAge: number; // 周岁
  traditionalAge: number; // 虚岁
  westernZodiac: string;
  chineseZodiac: string;
  lunarBirthDate: string;
  nextLunarBirthday: string;
  daysLived: number;
}

// Get Western zodiac sign based on month and day
export function getWesternZodiac(month: number, day: number): string {
  const zodiacSigns = [
    { name: '摩羯座', start: [1, 20], end: [2, 18] },
    { name: '水瓶座', start: [2, 19], end: [3, 20] },
    { name: '双鱼座', start: [3, 21], end: [4, 19] },
    { name: '白羊座', start: [4, 20], end: [5, 20] },
    { name: '金牛座', start: [5, 21], end: [6, 21] },
    { name: '双子座', start: [6, 22], end: [7, 22] },
    { name: '巨蟹座', start: [7, 23], end: [8, 22] },
    { name: '狮子座', start: [8, 23], end: [9, 22] },
    { name: '处女座', start: [9, 23], end: [10, 23] },
    { name: '天秤座', start: [10, 24], end: [11, 22] },
    { name: '天蝎座', start: [11, 23], end: [12, 21] }
  ];

  // Special case for Capricorn
  if ((month === 12 && day >= 22) || (month === 1 && day <= 19)) {
    return '摩羯座';
  }

  for (const sign of zodiacSigns) {
    if ((month === sign.start[0] && day >= sign.start[1]) || 
        (month === sign.end[0] && day <= sign.end[1])) {
      return sign.name;
    }
  }

  return '未知';
}

// Get Chinese zodiac sign based on year
export function getChineseZodiac(year: number): string {
  const animals = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪'];
  // Chinese zodiac cycle starts with rat in 1900 (year - 4) % 12
  const index = (year - 4) % 12;
  return animals[index];
}

// Calculate exact age in years, months, and days
export function calculateExactAge(birthDate: Date, endDate: Date): { years: number; months: number; days: number } {
  let years = endDate.getFullYear() - birthDate.getFullYear();
  let months = endDate.getMonth() - birthDate.getMonth();
  let days = endDate.getDate() - birthDate.getDate();

  // Adjust days if negative
  if (days < 0) {
    months--;
    const lastMonth = new Date(endDate.getFullYear(), endDate.getMonth(), 0);
    days += lastMonth.getDate();
  }

  // Adjust months if negative
  if (months < 0) {
    years--;
    months += 12;
  }

  return { years, months, days };
}

// Calculate nominal age (周岁) - this is the exact age
export function calculateNominalAge(birthDate: Date, endDate: Date): number {
  const exactAge = calculateExactAge(birthDate, endDate);
  return exactAge.years;
}

// Calculate traditional Chinese age (虚岁)
export function calculateTraditionalAge(birthYear: number, currentYear: number): number {
  return currentYear - birthYear + 1;
}

// Calculate total days lived
export function calculateDaysLived(birthDate: Date, endDate: Date): number {
  const timeDiff = endDate.getTime() - birthDate.getTime();
  return Math.floor(timeDiff / (1000 * 60 * 60 * 24));
}

// Get days in month for a given year and month
export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

// Validate date inputs
export function validateDateInputs(year: number, month: number, day: number, endDate?: Date): { isValid: boolean; error?: string } {
  const currentDate = new Date();
  
  // Check if birth date is in the future
  const birthDate = new Date(year, month - 1, day);
  const comparisonDate = endDate || currentDate;
  
  if (birthDate > comparisonDate) {
    return { isValid: false, error: '出生日期不能晚于截止日期' };
  }
  
  // Check if year is reasonable (between 1900 and current year)
  if (year < 1900 || year > currentDate.getFullYear()) {
    return { isValid: false, error: '请选择有效的出生年份' };
  }
  
  // Check if day is valid for the month
  const maxDays = getDaysInMonth(year, month);
  if (day > maxDays) {
    return { isValid: false, error: `${year}年${month}月只有${maxDays}天` };
  }
  
  return { isValid: true };
}

// Format age result for display
export function formatAgeResult(age: { years: number; months: number; days: number }): string {
  const parts = [];
  
  if (age.years > 0) {
    parts.push(`${age.years}岁`);
  }
  
  if (age.months > 0) {
    parts.push(`${age.months}个月`);
  }
  
  if (age.days > 0) {
    parts.push(`${age.days}天`);
  }
  
  return parts.length > 0 ? parts.join(' ') : '0天';
}

// Simple lunar calendar conversion (basic implementation)
// For production use, consider using a proper lunar calendar library
export function getLunarDate(solarDate: Date): string {
  // This is a simplified version - in real implementation, you'd use a proper lunar calendar library
  const year = solarDate.getFullYear();
  const month = solarDate.getMonth() + 1;
  const day = solarDate.getDate();
  
  // Chinese lunar months and days names
  const lunarMonths = ['正月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '冬月', '腊月'];
  const lunarDays = ['初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
                     '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
                     '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十'];
  
  // Chinese heavenly stems and earthly branches for year
  const heavenlyStems = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
  const earthlyBranches = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
  
  // Calculate lunar year (simplified - this is not accurate)
  const lunarYearIndex = (year - 1864) % 60;
  const stemIndex = lunarYearIndex % 10;
  const branchIndex = lunarYearIndex % 12;
  
  const lunarYear = heavenlyStems[stemIndex] + earthlyBranches[branchIndex] + '年';
  const lunarMonth = lunarMonths[month - 1];
  const lunarDay = lunarDays[Math.min(day - 1, 29)];
  
  return `${lunarYear}${lunarMonth}${lunarDay}`;
}

// Calculate next lunar birthday (simplified implementation)
export function getNextLunarBirthday(birthDate: Date, currentDate: Date): string {
  // This is a simplified version - in real implementation, you'd use proper lunar calendar calculations
  const currentYear = currentDate.getFullYear();
  
  // For simplicity, we'll return the solar date next year
  // In real implementation, this would convert lunar birthday to solar calendar
  const nextBirthday = new Date(currentYear + 1, birthDate.getMonth(), birthDate.getDate());
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  const weekday = weekdays[nextBirthday.getDay()];
  
  return `公历: ${nextBirthday.getFullYear()}年${nextBirthday.getMonth() + 1}月${nextBirthday.getDate()}日 (${weekday})`;
}

// Main calculation function
export function calculateAge(
  birthYear: number, 
  birthMonth: number, 
  birthDay: number, 
  endDate?: Date
): AgeResult | { error: string } {
  // Validate inputs
  const validation = validateDateInputs(birthYear, birthMonth, birthDay, endDate);
  if (!validation.isValid) {
    return { error: validation.error || '输入日期无效' };
  }
  
  // Normalize dates to avoid timezone issues
  const birthDate = new Date(birthYear, birthMonth - 1, birthDay);
  const comparisonDate = endDate || new Date();
  birthDate.setHours(0, 0, 0, 0);
  comparisonDate.setHours(0, 0, 0, 0);
  
  // Calculate all age-related values
  const exactAge = calculateExactAge(birthDate, comparisonDate);
  const nominalAge = calculateNominalAge(birthDate, comparisonDate);
  const traditionalAge = calculateTraditionalAge(birthYear, comparisonDate.getFullYear());
  const westernZodiac = getWesternZodiac(birthMonth, birthDay);
  const chineseZodiac = getChineseZodiac(birthYear);
  const lunarBirthDate = getLunarDate(birthDate);
  const nextLunarBirthday = getNextLunarBirthday(birthDate, comparisonDate);
  const daysLived = calculateDaysLived(birthDate, comparisonDate);
  
  return {
    exactAge,
    nominalAge,
    traditionalAge,
    westernZodiac,
    chineseZodiac,
    lunarBirthDate,
    nextLunarBirthday,
    daysLived
  };
}
