/**
 * Форматы и проверки полей: телефон, госномер, VIN, пробег, год, email.
 * Один модуль на всю CRM — иначе в трёх формах будут три разные проверки.
 */

/* ---------------------------------- Телефон --------------------------------- */

/** Только цифры российского номера: 11 знаков, начинается с 7. */
export function phoneDigits(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("8")) digits = `7${digits.slice(1)}`;
  if (digits.length && !digits.startsWith("7")) digits = `7${digits}`;
  return digits.slice(0, 11);
}

/** Маска ввода: +7 (916) 000-00-00. Показываем ровно столько, сколько введено. */
export function formatPhone(value: string) {
  const digits = phoneDigits(value);
  if (digits.length <= 1) return digits ? "+7 " : "";
  const rest = digits.slice(1);
  const parts = [rest.slice(0, 3), rest.slice(3, 6), rest.slice(6, 8), rest.slice(8, 10)];
  let out = "+7";
  if (parts[0]) out += ` (${parts[0]}`;
  if (parts[0].length === 3) out += ")";
  if (parts[1]) out += ` ${parts[1]}`;
  if (parts[2]) out += `-${parts[2]}`;
  if (parts[3]) out += `-${parts[3]}`;
  return out;
}

/** Номер заполнен полностью: 11 цифр. */
export function isValidPhone(value: string) {
  return phoneDigits(value).length === 11;
}

/** Для ссылки tel: — без скобок и пробелов. */
export function phoneHref(value: string) {
  const digits = phoneDigits(value);
  return digits ? `+${digits}` : "";
}

export const PHONE_HINT = "Российский номер: +7 и 10 цифр";

/* --------------------------------- Госномер --------------------------------- */

/** Буквы, разрешённые в российских номерах (визуально совпадают с латиницей). */
const RU_LETTERS = "АВЕКМНОРСТУХ";
const LATIN_TO_RU: Record<string, string> = {
  A: "А", B: "В", E: "Е", K: "К", M: "М", H: "Н",
  O: "О", P: "Р", C: "С", T: "Т", Y: "У", X: "Х",
};

export type PlateKind = "ru" | "foreign";

/** Латиницу приводим к кириллице: на клавиатуре часто набирают латиницей. */
export function normalizeRuPlate(value: string) {
  return value
    .toUpperCase()
    .replace(/[ABEKMHOPCTYX]/g, (letter) => LATIN_TO_RU[letter] ?? letter)
    .replace(/[^АВЕКМНОРСТУХ0-9]/g, "")
    .slice(0, 9);
}

const L = `[${RU_LETTERS}]`;
/**
 * Российские форматы:
 * А123ВС777 — легковой, А123ВС77
 * АА1234 77 — такси и коммерческий (две буквы, четыре цифры)
 * АВ123477 — прицеп (две буквы, четыре цифры)
 * 1234АВ77 — мототранспорт
 */
const RU_PLATE_PATTERNS = [
  new RegExp(`^${L}\\d{3}${L}{2}\\d{2,3}$`),
  new RegExp(`^${L}{2}\\d{4}\\d{2,3}$`),
  new RegExp(`^\\d{4}${L}{2}\\d{2,3}$`),
  new RegExp(`^${L}{2}\\d{3}\\d{2,3}$`),
];

export function isValidRuPlate(value: string) {
  const plain = normalizeRuPlate(value);
  return RU_PLATE_PATTERNS.some((pattern) => pattern.test(plain));
}

/** Иностранный номер: свободный формат, но без мусора и разумной длины. */
export function normalizeForeignPlate(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9Ѐ-ӿ -]/g, "").replace(/\s+/g, " ").slice(0, 15);
}

export function isValidForeignPlate(value: string) {
  const plain = normalizeForeignPlate(value).replace(/[\s-]/g, "");
  return plain.length >= 4 && plain.length <= 12 && /\d/.test(plain);
}

export function normalizePlate(value: string, kind: PlateKind) {
  return kind === "ru" ? normalizeRuPlate(value) : normalizeForeignPlate(value);
}

export function isValidPlate(value: string, kind: PlateKind) {
  return kind === "ru" ? isValidRuPlate(value) : isValidForeignPlate(value);
}

/** Показываем номер с пробелом перед регионом: А123ВС 797. */
export function formatPlate(value: string) {
  const plain = normalizeRuPlate(value);
  if (!isValidRuPlate(plain)) return value.trim().toUpperCase();
  const region = plain.slice(-3).match(/^\d{3}$/) ? plain.slice(-3) : plain.slice(-2);
  return `${plain.slice(0, plain.length - region.length)} ${region}`;
}

/** Номер похож на российский — подсказка при переключении типа. */
export function looksRussian(value: string) {
  return isValidRuPlate(value);
}

export const RU_PLATE_HINT = "Например, А123ВС 797. Буквы только А В Е К М Н О Р С Т У Х";
export const FOREIGN_PLATE_HINT = "Например, AB-123-CD. От 4 до 12 знаков, минимум одна цифра";

/* ------------------------------------ VIN ----------------------------------- */

/** В VIN не бывает букв I, O и Q — их путают с единицей и нулём. */
export function normalizeVin(value: string) {
  return value.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, "").slice(0, 17);
}

export function isValidVin(value: string) {
  return normalizeVin(value).length === 17;
}

export const VIN_HINT = "17 знаков, без букв I, O и Q";

/* ------------------------------- Числовые поля ------------------------------ */

export function isValidMileage(value: string) {
  if (!value) return true;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 && number <= 2_000_000;
}

export function isValidYear(value: string) {
  if (!value) return true;
  const year = Number(value);
  return year >= 1950 && year <= new Date().getFullYear() + 1;
}

export function isValidEmail(value: string) {
  if (!value.trim()) return true;
  return /^[^\s@]+@[^\s@]+\.[a-zA-Zа-яА-Я]{2,}$/.test(value.trim());
}

/** Дата рождения не в будущем и не раньше 1900 года. */
export function isValidBirthday(value: string) {
  if (!value) return true;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date <= new Date() && date.getFullYear() >= 1900;
}

/** ИНН: 10 знаков у организации, 12 у ИП. */
export function isValidInn(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return true;
  return digits.length === 10 || digits.length === 12;
}

/* ---------------------------------- Деньги ---------------------------------- */

/** Верхний предел суммы в поле: защищает от случайно зажатой клавиши. */
export const MAX_MONEY = 10_000_000;

export function moneyInput(value: string) {
  return value.replace(/\D/g, "").slice(0, 8);
}

export function isValidMoney(value: string, { allowZero = false } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number)) return false;
  if (!allowZero && number <= 0) return false;
  return number >= 0 && number <= MAX_MONEY;
}
