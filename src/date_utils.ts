const YEAR = 'year';
const MONTH = 'month';
const DAY = 'day';
const HOUR = 'hour';
const MINUTE = 'minute';
const SECOND = 'second';
const MILLISECOND = 'millisecond';

export interface DateUtils {
  parse(date: string | Date): Date;
  format(date: Date, format: string, lang: string): string;
  add(date: Date, amount: number, scale: TimeScale): Date;
  diff(date1: Date, date2: Date, scale?: TimeScale): number;
  start_of(date: Date, scale: TimeScale): Date;
  parse_duration(duration: string): DurationResult | undefined;
  convert_scales(from: string, to: TimeScale): number;
  to_string(date: Date, with_time: boolean): string;
  get_date_values(date: Date): number[];
  today(): Date;
  now(): Date;
  clone(date: Date): Date;
  get_days_in_month(date: Date): number;
  get_days_in_year(date: Date): number;
}

export type TimeScale = 'year' | 'month' | 'day' | 'hour' | 'minute' | 'second' | 'millisecond';

export interface DurationResult {
  duration: number;
  scale: TimeScale;
}

const dateUtils: DateUtils = {
  parse_duration(duration: string): DurationResult | undefined {
    const regex = /([0-9]+)(y|m|d|h|min|s|ms)/gm;
    const matches = regex.exec(duration);
    if (matches !== null) {
      if (matches[2] === 'y') {
        return { duration: parseInt(matches[1]), scale: `year` };
      } else if (matches[2] === 'm') {
        return { duration: parseInt(matches[1]), scale: `month` };
      } else if (matches[2] === 'd') {
        return { duration: parseInt(matches[1]), scale: `day` };
      } else if (matches[2] === 'h') {
        return { duration: parseInt(matches[1]), scale: `hour` };
      } else if (matches[2] === 'min') {
        return { duration: parseInt(matches[1]), scale: `minute` };
      } else if (matches[2] === 's') {
        return { duration: parseInt(matches[1]), scale: `second` };
      } else if (matches[2] === 'ms') {
        return { duration: parseInt(matches[1]), scale: `millisecond` };
      }
    }
    return undefined;
  },

  parse(date: string | Date, date_separator = '-', time_separator = /[.:]/): Date {
    if (date instanceof Date) {
      return date;
    }
    if (typeof date === 'string') {
      const parts = date.split(' ');
      const date_parts = parts[0].split(date_separator).map((val: string) => parseInt(val, 10));
      const time_parts = parts[1] ? parts[1].split(time_separator).map(Number) : [];

      // month is 0 indexed
      date_parts[1] = date_parts[1] ? date_parts[1] - 1 : 0;

      let vals = date_parts;

      if (time_parts.length) {
        if (time_parts.length === 4) {
          time_parts[3] = parseFloat('0.' + time_parts[3]) * 1000;
        }
        vals = vals.concat(time_parts);
      }
      return new Date(vals[0], vals[1], vals[2], vals[3] || 0, vals[4] || 0, vals[5] || 0, vals[6] || 0);
    }
    throw new Error('Invalid date format');
  },

  to_string(date: Date, with_time = false): string {
    if (!(date instanceof Date)) {
      throw new TypeError('Invalid argument type');
    }
    const vals = this.get_date_values(date).map((val, i) => {
      if (i === 1) {
        // add 1 for month
        val = val + 1;
      }

      if (i === 6) {
        return padStart(val + '', 3, '0');
      }

      return padStart(val + '', 2, '0');
    });
    const date_string = `${vals[0]}-${vals[1]}-${vals[2]}`;
    const time_string = `${vals[3]}:${vals[4]}:${vals[5]}.${vals[6]}`;

    return date_string + (with_time ? ' ' + time_string : '');
  },

  format(date: Date, date_format = 'YYYY-MM-DD HH:mm:ss.SSS', lang = 'en'): string {
    const dateTimeFormat = new Intl.DateTimeFormat(lang, {
      month: 'long',
    });
    const dateTimeFormatShort = new Intl.DateTimeFormat(lang, {
      month: 'short',
    });
    const month_name = dateTimeFormat.format(date);
    const month_name_capitalized = month_name.charAt(0).toUpperCase() + month_name.slice(1);

    const values = this.get_date_values(date).map((d) => padStart(d, 2, 0));
    const format_map: Record<string, string> = {
      YYYY: values[0],
      MM: padStart(+values[1] + 1, 2, 0),
      DD: values[2],
      HH: values[3],
      mm: values[4],
      ss: values[5],
      SSS: values[6],
      D: values[2],
      MMMM: month_name_capitalized,
      MMM: dateTimeFormatShort.format(date),
    };

    let str = date_format;
    const formatted_values: string[] = [];

    Object.keys(format_map)
      .sort((a, b) => b.length - a.length)
      .forEach((key) => {
        if (str.includes(key)) {
          str = str.replaceAll(key, `$${formatted_values.length}`);
          formatted_values.push(format_map[key]);
        }
      });

    formatted_values.forEach((value, i) => {
      str = str.replaceAll(`$${i}`, value);
    });

    return str;
  },

  diff(date_a: Date, date_b: Date, scale: TimeScale = 'day'): number {
    const milliseconds =
      date_a.getTime() - date_b.getTime() + (date_b.getTimezoneOffset() - date_a.getTimezoneOffset()) * 60000;
    const seconds = milliseconds / 1000;
    const minutes = seconds / 60;
    const hours = minutes / 60;
    const days = hours / 24;

    let yearDiff = date_a.getFullYear() - date_b.getFullYear();
    let monthDiff = date_a.getMonth() - date_b.getMonth();
    monthDiff += (days % 30) / 30;

    if (date_a.getDate() < date_b.getDate()) {
      monthDiff--;
    }

    const months = yearDiff * 12 + monthDiff;
    const years = months / 12;

    const scaleMap: Record<TimeScale, number> = {
      millisecond: milliseconds,
      second: seconds,
      minute: minutes,
      hour: hours,
      day: days,
      month: months,
      year: years,
    };

    return Math.round(scaleMap[scale] * 100) / 100;
  },

  today(): Date {
    const vals = this.get_date_values(new Date()).slice(0, 3);
    return new Date(vals[0], vals[1], vals[2]);
  },

  now(): Date {
    return new Date();
  },

  add(date: Date, qty: number, scale: TimeScale): Date {
    qty = parseInt(qty.toString(), 10);
    const vals = [
      date.getFullYear() + (scale === YEAR ? qty : 0),
      date.getMonth() + (scale === MONTH ? qty : 0),
      date.getDate() + (scale === DAY ? qty : 0),
      date.getHours() + (scale === HOUR ? qty : 0),
      date.getMinutes() + (scale === MINUTE ? qty : 0),
      date.getSeconds() + (scale === SECOND ? qty : 0),
      date.getMilliseconds() + (scale === MILLISECOND ? qty : 0),
    ];
    return new Date(vals[0], vals[1], vals[2], vals[3], vals[4], vals[5], vals[6]);
  },

  start_of(date: Date, scale: TimeScale): Date {
    const scores: Record<TimeScale, number> = {
      [YEAR]: 6,
      [MONTH]: 5,
      [DAY]: 4,
      [HOUR]: 3,
      [MINUTE]: 2,
      [SECOND]: 1,
      [MILLISECOND]: 0,
    };

    function should_reset(_scale: TimeScale): boolean {
      const max_score = scores[scale];
      return scores[_scale] <= max_score;
    }

    const vals = [
      date.getFullYear(),
      should_reset('year') ? 0 : date.getMonth(),
      should_reset('month') ? 1 : date.getDate(),
      should_reset('day') ? 0 : date.getHours(),
      should_reset('hour') ? 0 : date.getMinutes(),
      should_reset('minute') ? 0 : date.getSeconds(),
      should_reset('second') ? 0 : date.getMilliseconds(),
    ];

    return new Date(vals[0], vals[1], vals[2], vals[3], vals[4], vals[5], vals[6]);
  },

  clone(date: Date): Date {
    return new Date(date.getTime());
  },

  get_date_values(date: Date): number[] {
    return [
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      date.getHours(),
      date.getMinutes(),
      date.getSeconds(),
      date.getMilliseconds(),
    ];
  },

  convert_scales(period: string, to_scale: TimeScale): number {
    const TO_DAYS: Record<TimeScale, number> = {
      millisecond: 1 / 60 / 60 / 24 / 1000,
      second: 1 / 60 / 60 / 24,
      minute: 1 / 60 / 24,
      hour: 1 / 24,
      day: 1,
      month: 30,
      year: 365,
    };

    const result = this.parse_duration(period);
    if (!result) {
      throw new Error('Invalid period format');
    }

    const in_days = result.duration * TO_DAYS[result.scale];
    return in_days / TO_DAYS[to_scale];
  },

  get_days_in_month(date: Date): number {
    const no_of_days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

    const month = date.getMonth();

    if (month !== 1) {
      return no_of_days[month];
    }

    // Feb
    const year = date.getFullYear();
    if ((year % 4 === 0 && year % 100 != 0) || year % 400 === 0) {
      return 29;
    }
    return 28;
  },

  get_days_in_year(date: Date): number {
    return date.getFullYear() % 4 ? 365 : 366;
  },
};

function padStart(str: string | number, targetLength: number, padString: string | number): string {
  str = str.toString();
  targetLength = targetLength >> 0;
  padString = String(typeof padString !== 'undefined' ? padString : ' ');
  if (str.length > targetLength) {
    return String(str);
  } else {
    targetLength = targetLength - str.length;
    if (targetLength > padString.length) {
      padString += padString.repeat(targetLength / padString.length);
    }
    return padString.slice(0, targetLength) + String(str);
  }
}

export default dateUtils;
