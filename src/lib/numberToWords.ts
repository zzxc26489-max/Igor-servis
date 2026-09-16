const HUNDREDS = ["", "сто", "двести", "триста", "четыреста", "пятьсот", "шестьсот", "семьсот", "восемьсот", "девятьсот"];
const TENS = ["", "", "двадцать", "тридцать", "сорок", "пятьдесят", "шестьдесят", "семьдесят", "восемьдесят", "девяносто"];
const TEENS = ["десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать", "пятнадцать", "шестнадцать", "семнадцать", "восемнадцать", "девятнадцать"];
const ONES_MALE = ["", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"];
const ONES_FEMALE = ["", "одна", "две", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"];

function pluralForm(value: number, one: string, few: string, many: string) {
  const mod100 = value % 100;
  const mod10 = value % 10;
  if (mod100 >= 11 && mod100 <= 19) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

function triad(value: number, feminine = false) {
  const parts: string[] = [];
  parts.push(HUNDREDS[Math.floor(value / 100)]);
  const rest = value % 100;
  if (rest >= 10 && rest < 20) {
    parts.push(TEENS[rest - 10]);
  } else {
    parts.push(TENS[Math.floor(rest / 10)]);
    parts.push((feminine ? ONES_FEMALE : ONES_MALE)[rest % 10]);
  }
  return parts.filter(Boolean).join(" ");
}

export function numberToWords(value: number): string {
  const n = Math.floor(Math.abs(Number(value) || 0));
  if (n === 0) return "ноль";

  const parts: string[] = [];
  const millions = Math.floor(n / 1_000_000) % 1000;
  const thousands = Math.floor(n / 1000) % 1000;
  const rest = n % 1000;

  if (millions) parts.push(triad(millions), pluralForm(millions, "миллион", "миллиона", "миллионов"));
  if (thousands) parts.push(triad(thousands, true), pluralForm(thousands, "тысяча", "тысячи", "тысяч"));
  if (rest) parts.push(triad(rest));

  return parts.filter(Boolean).join(" ").trim();
}

export function rublesWord(value: number): string {
  const n = Math.floor(Math.abs(value));
  const last = n % 10;
  const last2 = n % 100;
  if (last2 >= 11 && last2 <= 19) return "рублей";
  if (last === 1) return "рубль";
  if (last >= 2 && last <= 4) return "рубля";
  return "рублей";
}

export function amountInWords(value: number): string {
  const rounded = Math.round(value);
  const words = numberToWords(rounded);
  const capitalized = words.charAt(0).toUpperCase() + words.slice(1);
  return `${capitalized} ${rublesWord(rounded)} 00 копеек`;
}

export function roundToTens(price: number): number {
  return Math.max(0, Math.round(price / 10) * 10);
}
