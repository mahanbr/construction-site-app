/* ============================================================
   jalali.js
   Self-contained Gregorian <-> Jalali (Solar Hijri) conversion.
   Based on the standard public astronomical-calendar algorithm
   (33-year leap-year cycle). No external CDN dependency, so the
   app keeps working even on a slow/offline site connection.

   All DB dates are stored as Gregorian 'YYYY-MM-DD' strings.
   Everything shown to the user is converted to Jalali here.
   ============================================================ */

const Jalali = (() => {

  const g_days_in_month = [31,28,31,30,31,30,31,31,30,31,30,31];
  const j_days_in_month = [31,31,31,31,31,31,30,30,30,30,30,29];

  function isLeapGregorian(year) {
    return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
  }

  function gregorianToJulianDayNumber(gy, gm, gd) {
    let d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) +
            div(153 * mod(gm + 9, 12) + 2, 5) +
            gd - 34840408;
    d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
    return d;
  }

  function julianDayNumberToGregorian(jdn) {
    let j = 4 * jdn + 139361631;
    j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
    const i = div(mod(j, 1461), 4) * 5 + 308;
    const gd = div(mod(i, 153), 5) + 1;
    const gm = mod(div(i, 153), 12) + 1;
    const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
    return { gy, gm, gd };
  }

  function div(a, b) { return Math.trunc(a / b); }
  function mod(a, b) { return a - Math.trunc(a / b) * b; }

  const JALALI_BREAKS = [-61,9,38,199,426,686,756,818,1111,1181,1210,1635,2060,2097,2192,2262,2324,2394,2456,3178];

  // Determine, for a given Jalali year, which Gregorian calendar date
  // (month=3, day=march) corresponds to the 1st of Farvardin, plus
  // whether that Jalali year is leap. Uses the standard 33-year-break
  // cycle algorithm for the Solar Hijri calendar.
  function jalCal(jy) {
    const bl = JALALI_BREAKS.length;
    const gy = jy + 621;
    let leapJ = -14;
    let jp = JALALI_BREAKS[0];
    let jump = 0;
    let i;
    for (i = 1; i < bl; i += 1) {
      const jm = JALALI_BREAKS[i];
      jump = jm - jp;
      if (jy < jm) break;
      leapJ += div(jump, 33) * 8 + div(mod(jump, 33), 4);
      jp = jm;
    }
    let n = jy - jp;
    leapJ += div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
    if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
    const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
    const march = 20 + leapJ - leapG;
    if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
    let leap = mod(mod(n + 1, 33) - 1, 4);
    if (leap === -1) leap = 4;
    return { leap, gy, march };
  }

  function toJalaali(gy, gm, gd) {
    const jdn = gregorianToJulianDayNumber(gy, gm, gd);
    return jdnToJalaali(jdn);
  }

  function jdnToJalaali(jdn) {
    const gy = julianDayNumberToGregorian(jdn).gy;
    let jy = gy - 621;
    const r = jalCal(jy);
    const jdn1f = gregorianToJulianDayNumber(r.gy, 3, r.march);
    let k = jdn - jdn1f;
    if (k >= 0) {
      if (k <= 185) {
        return { jy, jm: 1 + div(k, 31), jd: mod(k, 31) + 1 };
      }
      k -= 186;
    } else {
      // jdn falls in the previous Jalaali year
      jy -= 1;
      k += 179;
      if (r.leap === 1) k += 1;
    }
    return { jy, jm: 7 + div(k, 30), jd: mod(k, 30) + 1 };
  }

  function toGregorian(jy, jm, jd) {
    const r = jalCal(jy);
    const jdn = gregorianToJulianDayNumber(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
    return julianDayNumberToGregorian(jdn);
  }

  function isLeapJalaliYear(jy) {
    return jalCal(jy).leap === 0;
  }

  const monthNames = ['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
  const dowNames = ['یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنجشنبه','جمعه','شنبه'];
  const dowShort = ['ی','د','س','چ','پ','ج','ش'];

  const persianDigitMap = { '0':'۰','1':'۱','2':'۲','3':'۳','4':'۴','5':'۵','6':'۶','7':'۷','8':'۸','9':'۹' };

  function toPersianDigits(input) {
    return String(input).replace(/[0-9]/g, (d) => persianDigitMap[d]);
  }

  function toLatinDigits(input) {
    const map = { '۰':'0','۱':'1','۲':'2','۳':'3','۴':'4','۵':'5','۶':'6','۷':'7','۸':'8','۹':'9' };
    return String(input).replace(/[۰-۹]/g, (d) => map[d]);
  }

  // date object -> {jy,jm,jd}
  function fromDateObj(dateObj) {
    return toJalaali(dateObj.getFullYear(), dateObj.getMonth() + 1, dateObj.getDate());
  }

  // Gregorian ISO string 'YYYY-MM-DD' -> jalali parts
  function fromISO(iso) {
    const [gy, gm, gd] = iso.split('-').map(Number);
    return toJalaali(gy, gm, gd);
  }

  // jalali parts -> Gregorian ISO string 'YYYY-MM-DD' (for DB storage)
  function toISO(jy, jm, jd) {
    const g = toGregorian(jy, jm, jd);
    const mm = String(g.gm).padStart(2, '0');
    const dd = String(g.gd).padStart(2, '0');
    return `${g.gy}-${mm}-${dd}`;
  }

  // JS Date -> weekday index (0=Sat..6=Fri) to match Persian week order
  function faDow(dateObj) {
    const js = dateObj.getDay(); // 0=Sun..6=Sat
    return (js + 1) % 7; // shift so 0=Sat
  }

  function todayISO() {
    const d = new Date();
    const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), day = String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
  }

  function todayJalali() {
    return fromISO(todayISO());
  }

  // "شنبه، ۱۴ شهریور ۱۴۰۵"
  function formatLongFromISO(iso) {
    const [gy, gm, gd] = iso.split('-').map(Number);
    const dateObj = new Date(gy, gm - 1, gd);
    const { jy, jm, jd } = toJalaali(gy, gm, gd);
    const dow = dowNames[faDow(dateObj)];
    return `${dow}، ${toPersianDigits(jd)} ${monthNames[jm - 1]} ${toPersianDigits(jy)}`;
  }

  // "۱۴ شهریور ۱۴۰۵" (no weekday)
  function formatShortFromISO(iso) {
    const [gy, gm, gd] = iso.split('-').map(Number);
    const { jy, jm, jd } = toJalaali(gy, gm, gd);
    return `${toPersianDigits(jd)} ${monthNames[jm - 1]} ${toPersianDigits(jy)}`;
  }

  function daysInJalaliMonth(jy, jm) {
    if (jm <= 6) return 31;
    if (jm <= 11) return 30;
    return isLeapJalaliYear(jy) ? 30 : 29;
  }

  return {
    toJalaali, toGregorian, toISO, fromISO, fromDateObj,
    toPersianDigits, toLatinDigits,
    monthNames, dowNames, dowShort,
    todayISO, todayJalali,
    formatLongFromISO, formatShortFromISO,
    daysInJalaliMonth, faDow, isLeapJalaliYear
  };
})();
