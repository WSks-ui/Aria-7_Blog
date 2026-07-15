export const DEFAULT_TIME_ZONE = "Asia/Shanghai";

export interface CalendarCell {
  day: number | null;
  key?: string;
  isToday?: boolean;
  hasPost?: boolean;
}

export interface CalendarModel {
  year: number;
  month: number;
  title: string;
  cells: CalendarCell[];
}

interface DateParts {
  year: number;
  month: number;
  day: number;
}

const getDateParts = (date: Date, timeZone = DEFAULT_TIME_ZONE): DateParts => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return { year: read("year"), month: read("month"), day: read("day") };
};

const calendarSerial = (date: Date, timeZone = DEFAULT_TIME_ZONE): number => {
  // 将目标时区的年月日映射为 UTC 日序号，避免夏令时或本机时区产生 23/25 小时的日期误差。
  const { year, month, day } = getDateParts(date, timeZone);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
};

export const toDateKey = (date: Date, timeZone = DEFAULT_TIME_ZONE): string => {
  const { year, month, day } = getDateParts(date, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

export const getRuntimeDays = (
  startDate: Date,
  now = new Date(),
  timeZone = DEFAULT_TIME_ZONE,
): number => Math.max(1, calendarSerial(now, timeZone) - calendarSerial(startDate, timeZone) + 1);

export const formatRelativeActivity = (
  activityDate: Date,
  now = new Date(),
  timeZone = DEFAULT_TIME_ZONE,
): string => {
  const days = Math.max(0, calendarSerial(now, timeZone) - calendarSerial(activityDate, timeZone));
  return days === 0 ? "今天" : `${days} 天前`;
};

export const buildCalendarModel = (
  postDates: Date[],
  now = new Date(),
  timeZone = DEFAULT_TIME_ZONE,
): CalendarModel => {
  const { year, month, day: today } = getDateParts(now, timeZone);
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const monthDays = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const postKeys = new Set(postDates.map((date) => toDateKey(date, timeZone)));
  const cells: CalendarCell[] = Array.from({ length: firstWeekday }, () => ({ day: null }));

  for (let day = 1; day <= monthDays; day += 1) {
    const key = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    cells.push({ day, key, isToday: day === today, hasPost: postKeys.has(key) });
  }
  while (cells.length % 7 !== 0) cells.push({ day: null });

  return {
    year,
    month,
    title: new Intl.DateTimeFormat("zh-CN", { timeZone, year: "numeric", month: "long" }).format(now),
    cells,
  };
};
