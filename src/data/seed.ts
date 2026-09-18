import { toISODate } from "../lib/date.ts";
import type {
  Client,
  Employee,
  Expense,
  Invoice,
  Lift,
  Payment,
  Order,
  Service,
  StockItem,
  StockMovement,
  Vehicle,
} from "../types";


/** Демо-данные привязаны к текущему дню, чтобы расписание всегда было наполнено. */
function day(offset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return toISODate(date);
}

function at(offset: number, time: string) {
  return `${day(offset)}T${time}:00`;
}

/** Метка «N минут назад» — активные демо-заказы выглядят живыми в любое время. */
function ago(minutes: number) {
  const date = new Date(Date.now() - minutes * 60_000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${toISODate(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}:00`;
}

export const lifts: Lift[] = [
  { id: 1, name: "Подъёмник 1", status: "busy" },
  { id: 2, name: "Подъёмник 2", status: "busy" },
  { id: 3, name: "Подъёмник 3", status: "free" },
  { id: 4, name: "Подъёмник 4", status: "busy" },
  { id: 5, name: "Подъёмник 5", status: "free" },
];

const employeeList: Employee[] = [
  {
    id: "emp-igor",
    name: "Игорь",
    role: "Владелец, мастер-приёмщик",
    payType: "percent",
    payValue: 40,
    accrued: 0,
    paid: 0,
  },
  {
    id: "emp-yura",
    name: "Юра",
    role: "Владелец, администрирование, счета",
    payType: "percent",
    payValue: 40,
    accrued: 0,
    paid: 0,
  },
  {
    id: "emp-elena",
    name: "Елена",
    role: "Учёт, документы, таблицы",
    payType: "salary",
    payValue: 45000,
    accrued: 0,
    paid: 0,
  },
  {
    id: "emp-mech1",
    name: "Механик 1", // TODO: указать реальное имя
    role: "Механик",
    payType: "percent",
    payValue: 35,
    accrued: 0,
    paid: 0,
  },
  {
    id: "emp-mech2",
    name: "Механик 2", // TODO: указать реальное имя
    role: "Механик",
    payType: "percent",
    payValue: 35,
    accrued: 0,
    paid: 0,
  },
];

export const clients: Client[] = [
  { id: "cl-1", code: "К-0001", name: "Смирнов Алексей", phone: "+7 (916) 000-00-01", isRegular: true, discountPercent: 5, source: "Сарафанное радио", createdAt: day(-900), birthday: "1988-06-04", notes: "Приезжает по субботам, просит звонить заранее" },
  { id: "cl-2", code: "К-0002", name: "Кузнецова Мария", phone: "+7 (916) 000-00-02", isRegular: true, discountPercent: 5, source: "Яндекс Карты", createdAt: day(-760), email: "kuznecova@example.com" },
  { id: "cl-3", code: "К-0003", name: "Волков Дмитрий", phone: "+7 (916) 000-00-03", source: "Авито", createdAt: day(-480) },
  { id: "cl-4", code: "К-0004", name: "Лебедев Сергей", phone: "+7 (916) 000-00-04", isRegular: true, createdAt: day(-410) },
  { id: "cl-5", code: "К-0005", name: "Панфилова Елена", phone: "+7 (916) 000-00-05", source: "Яндекс Карты", createdAt: day(-330) },
  { id: "cl-6", code: "К-0006", name: "Гончаров Павел", phone: "+7 (916) 000-00-06", source: "Сарафанное радио", createdAt: day(-300), notes: "Таксопарк, две машины" },
  { id: "cl-7", code: "К-0007", name: "Егорова Ольга", phone: "+7 (916) 000-00-07", source: "Авито", createdAt: day(-260), birthday: "1991-11-19" },
  { id: "cl-8", code: "К-0008", name: "Никитин Роман", phone: "+7 (916) 000-00-08", isRegular: true, discountPercent: 3, source: "Сарафанное радио", createdAt: day(-190) },
  { id: "cl-9", code: "К-0009", name: "Соболева Ирина", phone: "+7 (916) 000-00-09", source: "Яндекс Карты", createdAt: day(-140) },
  { id: "cl-10", code: "К-0010", name: "Тарасов Андрей", phone: "+7 (916) 000-00-10", source: "2ГИС", createdAt: day(-95) },
  { id: "cl-11", code: "К-0011", name: "Филиппов Максим", phone: "+7 (916) 000-00-11", source: "Авито", createdAt: day(-58) },
  { id: "cl-12", code: "К-0012", name: "Абрамова Юлия", phone: "+7 (916) 000-00-12", source: "Яндекс Карты", createdAt: day(-31) },
  { id: "cl-13", code: "К-0013", name: "Зотов Кирилл", phone: "+7 (916) 000-00-13", source: "Сарафанное радио", createdAt: day(-12) },
  { id: "cl-14", code: "К-0014", name: "Мельникова Дарья", phone: "+7 (916) 000-00-14", source: "2ГИС", createdAt: day(-5) },
  { id: "cl-15", code: "К-0015", name: "Логинов Артём", phone: "+7 (916) 000-00-15", source: "Авито", createdAt: day(-2) },
];

export const vehicles: Vehicle[] = [
  { id: "veh-1", code: "А-0001", clientId: "cl-1", make: "Toyota", model: "Camry", plate: "А123ВС 797", mileage: 82000, year: 2019, color: "Чёрный", engine: "2.5 бензин", transmission: "АКПП", nextServiceMileage: 92000, nextServiceDate: day(74) },
  { id: "veh-2", code: "А-0002", clientId: "cl-2", make: "Kia", model: "Sportage", plate: "Н456МК 799", mileage: 78460, vin: "XWEPH81ADMN123456", year: 2021, color: "Белый", engine: "2.0 дизель", transmission: "АКПП" },
  { id: "veh-3", code: "А-0003", clientId: "cl-3", make: "BMW", model: "X5", plate: "О789КХ 777", mileage: 145000, year: 2016, color: "Синий", engine: "3.0 дизель", transmission: "АКПП" },
  { id: "veh-4", code: "А-0004", clientId: "cl-4", make: "Hyundai", model: "Solaris", plate: "К222ТТ 750", mileage: 121000, year: 2017, color: "Серебристый", engine: "1.6 бензин", transmission: "МКПП" },
  { id: "veh-5", code: "А-0005", clientId: "cl-5", make: "Skoda", model: "Octavia", plate: "М333ЕЕ 197", mileage: 96500, year: 2018, color: "Синий", engine: "1.4 бензин", transmission: "АКПП" },
  { id: "veh-6", code: "А-0006", clientId: "cl-6", make: "Volkswagen", model: "Polo", plate: "Р555КН 750", mileage: 198000, year: 2016, color: "Белый", engine: "1.6 бензин", transmission: "МКПП" },
  { id: "veh-7", code: "А-0007", clientId: "cl-6", make: "Volkswagen", model: "Polo", plate: "Р556КН 750", mileage: 184000, year: 2016, color: "Белый", engine: "1.6 бензин", transmission: "МКПП" },
  { id: "veh-8", code: "А-0008", clientId: "cl-7", make: "Renault", model: "Duster", plate: "Т777ОР 197", mileage: 64300, year: 2020, color: "Оранжевый", engine: "2.0 бензин", transmission: "МКПП" },
  { id: "veh-9", code: "А-0009", clientId: "cl-8", make: "Mazda", model: "CX-5", plate: "У888ВС 777", mileage: 71200, year: 2019, color: "Красный", engine: "2.0 бензин", transmission: "АКПП" },
  { id: "veh-10", code: "А-0010", clientId: "cl-9", make: "Nissan", model: "Qashqai", plate: "Е111МР 799", mileage: 110400, year: 2015, color: "Серый", engine: "2.0 бензин", transmission: "вариатор" },
  { id: "veh-11", code: "А-0011", clientId: "cl-10", make: "Lada", model: "Vesta", plate: "К909АХ 750", mileage: 58900, year: 2021, color: "Синий", engine: "1.6 бензин", transmission: "МКПП" },
  { id: "veh-12", code: "А-0012", clientId: "cl-11", make: "Ford", model: "Focus", plate: "О404ТТ 197", mileage: 143700, year: 2014, color: "Чёрный", engine: "1.6 бензин", transmission: "АКПП" },
  { id: "veh-13", code: "А-0013", clientId: "cl-12", make: "Toyota", model: "RAV4", plate: "М606ХК 777", mileage: 49800, year: 2022, color: "Белый", engine: "2.0 бензин", transmission: "вариатор" },
  { id: "veh-14", code: "А-0014", clientId: "cl-13", make: "Kia", model: "Rio", plate: "А202СН 799", mileage: 87300, year: 2018, color: "Серый", engine: "1.6 бензин", transmission: "АКПП" },
  { id: "veh-15", code: "А-0015", clientId: "cl-14", make: "Hyundai", model: "Creta", plate: "Н313УК 750", mileage: 33100, year: 2023, color: "Тёмно-синий", engine: "1.6 бензин", transmission: "АКПП" },
  { id: "veh-16", code: "А-0016", clientId: "cl-15", make: "Skoda", model: "Rapid", plate: "В515ЕТ 197", mileage: 102600, year: 2019, color: "Серебристый", engine: "1.6 бензин", transmission: "АКПП" },
];

export const services: Service[] = [
  { id: "sv-1", name: "Компьютерная диагностика", category: "Диагностика", price: 1500 , normMinutes: 45 },
  { id: "sv-2", name: "Замена масла в ДВС", category: "ТО", price: 1200 , normMinutes: 30 },
  { id: "sv-3", name: "Замена масляного фильтра", category: "ТО", price: 600 , normMinutes: 15 },
  { id: "sv-4", name: "Замена воздушного фильтра", category: "ТО", price: 400 , normMinutes: 15 },
  { id: "sv-5", name: "Замена передних тормозных колодок", category: "Тормозная система", price: 2000 , normMinutes: 60 },
  { id: "sv-6", name: "Замена термостата", category: "Охлаждение", price: 1800 , normMinutes: 90 },
  { id: "sv-7", name: "Развал-схождение", category: "Ходовая", price: 2500 , normMinutes: 60 },
  { id: "sv-8", name: "Замена тормозных дисков (пара)", category: "Тормозная система", price: 3000 , normMinutes: 75 },
  { id: "sv-9", name: "Замена свечей зажигания", category: "Электрика", price: 450 , normMinutes: 30 },
  { id: "sv-10", name: "Замена салонного фильтра", category: "ТО", price: 500 , normMinutes: 15 },
  { id: "sv-11", name: "Замена антифриза", category: "Охлаждение", price: 1600 , normMinutes: 45 },
  { id: "sv-12", name: "Замена тормозной жидкости", category: "Тормозная система", price: 1800 , normMinutes: 45 },
  { id: "sv-13", name: "Замена передних амортизаторов", category: "Ходовая", price: 4500 , normMinutes: 120 },
  { id: "sv-14", name: "Замена ремня ГРМ", category: "Двигатель", price: 9500 , normMinutes: 240 },
  { id: "sv-15", name: "Замена сцепления", category: "Трансмиссия", price: 12000 , normMinutes: 300 },
  { id: "sv-16", name: "Замена масла в АКПП", category: "Трансмиссия", price: 4200 , normMinutes: 90 },
  { id: "sv-17", name: "Шиномонтаж (4 колеса)", category: "Шиномонтаж", price: 2400 , normMinutes: 45 },
  { id: "sv-18", name: "Заправка кондиционера", category: "Климат", price: 3200 , normMinutes: 40 },
  { id: "sv-19", name: "Замена ступичного подшипника", category: "Ходовая", price: 3800 , normMinutes: 90 },
  { id: "sv-20", name: "Замена аккумулятора", category: "Электрика", price: 700 , normMinutes: 15 },
];

export const stock: StockItem[] = [
  { id: "st-1", code: "С-0001", name: "Тормозные колодки (передние)", sku: "GDB1956", brand: "TRW", category: "Тормозная система", qty: 6, minQty: 4, purchasePrice: 3250, cell: "A-03-02", unit: "компл." },
  { id: "st-2", code: "С-0002", name: "Масляный фильтр (VAG)", sku: "26300-35505", brand: "MANN", category: "Фильтры", qty: 14, minQty: 6, purchasePrice: 980, cell: "A-01-02", unit: "шт." },
  { id: "st-3", code: "С-0003", name: "Моторное масло 5W-30", sku: "Shell 5W-30", brand: "Shell", category: "Масла", qty: 46, minQty: 20, purchasePrice: 850, cell: "B-04-01", unit: "л" },
  { id: "st-4", code: "С-0004", name: "Свечи зажигания (NGK)", sku: "BKR6E", brand: "NGK", category: "Электрика", qty: 32, minQty: 12, purchasePrice: 350, cell: "B-02-01", unit: "шт." },
  { id: "st-5", code: "С-0005", name: "Антифриз G12+", sku: "G12+", brand: "Felix", category: "Жидкости", qty: 24, minQty: 10, purchasePrice: 650, cell: "B-04-02", unit: "л" },
  { id: "st-6", code: "С-0006", name: "Воздушный фильтр", sku: "28113-D3100", brand: "MANN", category: "Фильтры", qty: 2, minQty: 5, purchasePrice: 1250, cell: "A-04-01", unit: "шт." },
  { id: "st-7", code: "С-0007", name: "Тормозной диск передний", sku: "DF4271", brand: "TRW", category: "Тормозная система", qty: 8, minQty: 4, purchasePrice: 4900, cell: "A-02-02", unit: "шт." },
  { id: "st-8", code: "С-0008", name: "Салонный фильтр", sku: "CUK2939", brand: "MANN", category: "Фильтры", qty: 11, minQty: 5, purchasePrice: 760, cell: "A-04-02", unit: "шт." },
  { id: "st-9", code: "С-0009", name: "Тормозная жидкость DOT-4", sku: "DOT4-1L", brand: "Bosch", category: "Жидкости", qty: 9, minQty: 4, purchasePrice: 520, cell: "B-05-01", unit: "л" },
  { id: "st-10", code: "С-0010", name: "Амортизатор передний", sku: "334262", brand: "KYB", category: "Ходовая", qty: 4, minQty: 2, purchasePrice: 5400, cell: "C-01-01", unit: "шт." },
  { id: "st-11", code: "С-0011", name: "Ремень ГРМ (комплект)", sku: "KTB331", brand: "Dayco", category: "Двигатель", qty: 1, minQty: 2, purchasePrice: 8700, cell: "C-02-01", unit: "компл." },
  { id: "st-12", code: "С-0012", name: "Масло АКПП ATF", sku: "ATF-DIII", brand: "Idemitsu", category: "Масла", qty: 18, minQty: 8, purchasePrice: 940, cell: "B-04-03", unit: "л" },
  { id: "st-13", code: "С-0013", name: "Аккумулятор 60Ач", sku: "6CT-60", brand: "Tyumen", category: "Электрика", qty: 3, minQty: 2, purchasePrice: 6300, cell: "C-03-01", unit: "шт." },
  { id: "st-14", code: "С-0014", name: "Ступичный подшипник", sku: "VKBA6996", brand: "SKF", category: "Ходовая", qty: 5, minQty: 3, purchasePrice: 2450, cell: "C-01-02", unit: "шт." },
  { id: "st-15", code: "С-0015", name: "Хладагент R134a", sku: "R134A-800", brand: "Errecom", category: "Климат", qty: 6, minQty: 3, purchasePrice: 2100, cell: "B-05-02", unit: "бал." },
];

const activeOrders: Order[] = [
  {
    id: "ord-268",
    timeline: [{ status: "запись" as const, at: ago(220) }, { status: "диагностика" as const, at: ago(190) }, { status: "в работе" as const, at: ago(150) }],
    number: "№АИ-0268",
    clientId: "cl-2",
    vehicleId: "veh-2",
    liftId: 2,
    status: "в работе",
    createdAt: at(0, "10:00"), plannedAt: day(0),
    advisor: "Игорь",
    scheduledStart: "10:00",
    scheduledEnd: "14:00",
    works: [
      { id: "w1", name: "Компьютерная диагностика", normMinutes: 45, qty: 1, price: 1500, executor: "Игорь" },
      { id: "w2", name: "Замена масла в ДВС", normMinutes: 30, qty: 1, price: 1200, executor: "Механик 1" },
      { id: "w3", name: "Замена передних тормозных колодок", normMinutes: 60, qty: 1, price: 2000, executor: "Механик 1" },
    ],
    parts: [
      { id: "p1", name: "Масляный фильтр", sku: "26300-35505", qty: 1, price: 980, availability: "reserved" },
      { id: "p2", name: "Тормозные колодки передние", sku: "GDB1956", qty: 1, price: 3480, availability: "reserved" },
    ],
    discount: 1500,
    paid: 0,
    notes: "Клиент жалуется на посторонний шум при торможении.",
  },
  {
    id: "ord-267",
    timeline: [{ status: "запись" as const, at: ago(160) }, { status: "в работе" as const, at: ago(130) }],
    number: "№АИ-0267",
    clientId: "cl-3",
    vehicleId: "veh-3",
    liftId: 4,
    status: "в работе",
    createdAt: at(0, "10:00"), plannedAt: day(0),
    advisor: "Юра",
    scheduledStart: "10:30",
    scheduledEnd: "13:30",
    works: [{ id: "w1", name: "Замена термостата", normMinutes: 90, qty: 1, price: 1800, executor: "Механик 2" }],
    parts: [],
    paid: 0,
  },
  {
    id: "ord-265",
    timeline: [{ status: "запись" as const, at: ago(95) }, { status: "в работе" as const, at: ago(80) }],
    number: "№АИ-0265",
    clientId: "cl-1",
    vehicleId: "veh-1",
    liftId: 1,
    status: "в работе",
    createdAt: at(0, "10:00"), plannedAt: day(0),
    advisor: "Игорь",
    scheduledStart: "10:00",
    scheduledEnd: "13:00",
    works: [
      { id: "w1", name: "Замена масла в ДВС", normMinutes: 30, qty: 1, price: 1200 },
      { id: "w2", name: "Компьютерная диагностика", normMinutes: 45, qty: 1, price: 1500 },
    ],
    parts: [],
    paid: 0,
  },
  {
    id: "ord-264",
    timeline: [{ status: "запись" as const, at: at(0, "10:00") }, { status: "в работе" as const, at: at(0, "10:10") }, { status: "готово" as const, at: at(0, "11:40") }],
    number: "№АИ-0264",
    clientId: "cl-4",
    vehicleId: "veh-4",
    liftId: 3,
    status: "готово",
    createdAt: at(0, "10:10"), plannedAt: day(0),
    advisor: "Юра",
    scheduledStart: "10:10",
    scheduledEnd: "11:40",
    works: [
      { id: "w1", name: "Замена масла в ДВС", normMinutes: 30, qty: 1, price: 1200, executor: "Механик 2" },
      { id: "w2", name: "Замена масляного фильтра", normMinutes: 15, qty: 1, price: 600, executor: "Механик 2" },
    ],
    parts: [{ id: "p1", name: "Моторное масло 5W-30", sku: "Shell 5W-30", qty: 4, price: 1100, availability: "in_stock" }],
    paid: 0,
    completedAt: at(0, "11:40"),
    notes: "Готово к выдаче, клиент обещал забрать после 17:00.",
  },
  {
    id: "ord-263",
    timeline: [{ status: "запись" as const, at: at(0, "11:00") }, { status: "диагностика" as const, at: at(0, "11:10") }, { status: "ожидает запчасти" as const, at: at(0, "12:05") }],
    number: "№АИ-0263",
    clientId: "cl-5",
    vehicleId: "veh-5",
    status: "ожидает запчасти",
    createdAt: at(-1, "11:00"), plannedAt: day(0),
    advisor: "Игорь",
    works: [{ id: "w1", name: "Замена передних тормозных колодок", normMinutes: 60, qty: 1, price: 2000 }],
    parts: [{ id: "p1", name: "Тормозной диск передний", sku: "DF4271", qty: 2, price: 6200, availability: "ordered" }],
    paid: 0,
    notes: "Диски в пути, поставщик обещал завтра к обеду.",
  },
  {
    id: "ord-262",
    timeline: [{ status: "запись" as const, at: at(-1, "10:20") }, { status: "в работе" as const, at: at(-1, "10:30") }, { status: "готово" as const, at: at(-1, "12:40") }],
    number: "№АИ-0262",
    clientId: "cl-1",
    vehicleId: "veh-1",
    status: "готово",
    createdAt: at(-1, "10:20"), plannedAt: day(-1),
    advisor: "Игорь",
    works: [{ id: "w1", name: "Развал-схождение", normMinutes: 60, qty: 1, price: 2500, executor: "Механик 1" }],
    parts: [],
    paid: 1000,
    completedAt: at(-1, "12:40"),
    notes: "Оплачена часть суммы, остаток при выдаче.",
  },
];


/**
 * Закрытые заказы, расходы и движения склада за последние месяцы генерируем:
 * так расписание, аналитика и отчёты наполнены на любом периоде, а править
 * руками несколько сотен записей не нужно.
 */
const HISTORY_DAYS = 130;

type Template = {
  works: [string, number][];
  parts: [string, string, number, number][];
};

const CLOSED_TEMPLATES: Template[] = [
  {
    works: [["Замена масла в ДВС", 1200], ["Замена масляного фильтра", 600], ["Замена воздушного фильтра", 400]],
    parts: [["Моторное масло 5W-30", "Shell 5W-30", 5, 1150], ["Масляный фильтр (VAG)", "26300-35505", 1, 1400]],
  },
  {
    works: [["Замена передних тормозных колодок", 2000], ["Замена тормозных дисков (пара)", 3000], ["Развал-схождение", 2500]],
    parts: [["Тормозные колодки (передние)", "GDB1956", 1, 4600], ["Тормозной диск передний", "DF4271", 2, 6900]],
  },
  {
    works: [["Компьютерная диагностика", 1500], ["Замена термостата", 1800], ["Замена антифриза", 1600]],
    parts: [["Антифриз G12+", "G12+", 6, 950]],
  },
  {
    works: [["Замена ремня ГРМ", 9500], ["Замена антифриза", 1600]],
    parts: [["Ремень ГРМ (комплект)", "KTB331", 1, 12300], ["Антифриз G12+", "G12+", 5, 950]],
  },
  {
    works: [["Компьютерная диагностика", 1500], ["Замена свечей зажигания", 450]],
    parts: [["Свечи зажигания (NGK)", "BKR6E", 4, 520]],
  },
  {
    works: [["Замена масла в АКПП", 4200], ["Замена салонного фильтра", 500]],
    parts: [["Масло АКПП ATF", "ATF-DIII", 7, 1350], ["Салонный фильтр", "CUK2939", 1, 1100]],
  },
  {
    works: [["Замена передних амортизаторов", 4500], ["Развал-схождение", 2500]],
    parts: [["Амортизатор передний", "334262", 2, 7600]],
  },
  {
    works: [["Замена ступичного подшипника", 3800]],
    parts: [["Ступичный подшипник", "VKBA6996", 1, 3500]],
  },
  {
    works: [["Заправка кондиционера", 3200], ["Замена салонного фильтра", 500]],
    parts: [["Хладагент R134a", "R134A-800", 1, 2950], ["Салонный фильтр", "CUK2939", 1, 1100]],
  },
  {
    works: [["Шиномонтаж (4 колеса)", 2400]],
    parts: [],
  },
  {
    works: [["Замена тормозной жидкости", 1800], ["Компьютерная диагностика", 1500]],
    parts: [["Тормозная жидкость DOT-4", "DOT4-1L", 1, 750]],
  },
  {
    works: [["Замена аккумулятора", 700], ["Компьютерная диагностика", 1500]],
    parts: [["Аккумулятор 60Ач", "6CT-60", 1, 8900]],
  },
  {
    works: [["Замена сцепления", 12000]],
    parts: [],
  },
  {
    works: [["Замена масла в ДВС", 1200], ["Замена масляного фильтра", 600], ["Замена салонного фильтра", 500], ["Развал-схождение", 2500]],
    parts: [
      ["Моторное масло 5W-30", "Shell 5W-30", 5, 1150],
      ["Масляный фильтр (VAG)", "26300-35505", 1, 1400],
      ["Салонный фильтр", "CUK2939", 1, 1100],
    ],
  },
];

/**
 * Клиент, его машина и день, с которого он у нас обслуживается. Пока клиент
 * «не появился», заказов по нему нет — так в аналитике честно видно новых и
 * повторных клиентов.
 */
const CLOSED_PAIRS: { clientId: string; vehicleId: string; since: number }[] = [
  { clientId: "cl-1", vehicleId: "veh-1", since: 900 },
  { clientId: "cl-2", vehicleId: "veh-2", since: 760 },
  { clientId: "cl-3", vehicleId: "veh-3", since: 480 },
  { clientId: "cl-4", vehicleId: "veh-4", since: 410 },
  { clientId: "cl-5", vehicleId: "veh-5", since: 330 },
  { clientId: "cl-6", vehicleId: "veh-6", since: 300 },
  { clientId: "cl-6", vehicleId: "veh-7", since: 300 },
  { clientId: "cl-7", vehicleId: "veh-8", since: 260 },
  { clientId: "cl-8", vehicleId: "veh-9", since: 190 },
  { clientId: "cl-9", vehicleId: "veh-10", since: 140 },
  { clientId: "cl-10", vehicleId: "veh-11", since: 95 },
  { clientId: "cl-11", vehicleId: "veh-12", since: 58 },
  { clientId: "cl-12", vehicleId: "veh-13", since: 31 },
  { clientId: "cl-13", vehicleId: "veh-14", since: 12 },
  { clientId: "cl-14", vehicleId: "veh-15", since: 5 },
  { clientId: "cl-15", vehicleId: "veh-16", since: 2 },
];

const MECHANICS = ["Механик 1", "Механик 2"];

/** Нормативы из прайса — держим рядом, чтобы демо-заказы совпадали с услугами. */
const NORM_MINUTES: Record<string, number> = Object.fromEntries(
  services.map((service) => [service.name, service.normMinutes ?? 60]),
);

/**
 * Темп мастеров: первый чуть растягивает работы, второй укладывается быстрее
 * норматива. Так в отчёте видно разницу, ради которой всё и затевалось.
 */
const PACE: Record<string, number> = { "Механик 1": 1.18, "Механик 2": 0.92 };

interface History {
  closed: Order[];
  expenses: Expense[];
  movements: StockMovement[];
}

function buildHistory(): History {
  const closed: Order[] = [];
  const expenses: Expense[] = [];
  const movements: StockMovement[] = [];

  let step = 0;
  /** Выручка с прошлой закупки — из неё считаем следующую, чтобы сервис работал в плюс. */
  let revenueSincePurchase = 0;
  let lastPurchaseDay = HISTORY_DAYS;

  for (let back = HISTORY_DAYS; back >= 0; back -= 1) {
    const weekday = new Date(day(-back)).getDay();
    const workingDay = weekday !== 0;
    // Сегодня пара машин уже уехала утром — подъёмники под ними не занимаем.
    const perDay = !workingDay ? 0 : back === 0 ? 2 : 2 + (step % 3);

    for (let index = 0; index < perDay; index += 1) {
      const template = CLOSED_TEMPLATES[step % CLOSED_TEMPLATES.length];
      const pool = CLOSED_PAIRS.filter((pair) => pair.since >= back);
      const { clientId, vehicleId } = pool[step % pool.length];
      const mechanic = MECHANICS[step % MECHANICS.length];

      const works = template.works.map(([name, price], i) => ({
        id: `w${i + 1}`,
        name,
        qty: 1,
        price,
        executor: name === "Компьютерная диагностика" ? "Игорь" : mechanic,
        normMinutes: NORM_MINUTES[name],
      }));
      const parts = template.parts.map(([name, sku, qty, price], i) => ({
        id: `p${i + 1}`,
        name,
        sku,
        qty,
        price,
        availability: "in_stock" as const,
      }));
      const total =
        works.reduce((sum, work) => sum + work.price * work.qty, 0) +
        parts.reduce((sum, part) => sum + part.price * part.qty, 0);
      // Раз в семь заказов — скидка постоянному клиенту.
      const discount = step % 7 === 0 ? Math.round((total * 0.05) / 10) * 10 : 0;
      const due = total - discount;
      // Пара заказов в неделю остаётся с частичным долгом: так видно «Ожидаем оплату».
      const paid = step % 11 === 0 ? Math.round(due / 2 / 100) * 100 : due;

      // Смены укладываем в рабочий день мастерской: 10:00, 12:30, 15:00, 17:30.
      const startMinutes = 10 * 60 + index * 150;
      // Фактическое время: у каждого мастера свой темп, плюс разброс по заказам.
      const norm = works.reduce((sum, work) => sum + (work.normMinutes ?? 0), 0);
      const pace = PACE[works.find((work) => work.executor !== "Игорь")?.executor ?? "Механик 1"] ?? 1;
      const spread = 1 + ((step % 7) - 3) * 0.06;
      const actual = Math.max(20, Math.round((norm * pace * spread) / 5) * 5);
      const clock = (minutes: number) =>
        `${String(Math.floor(Math.min(minutes, 20 * 60) / 60)).padStart(2, "0")}:${String(Math.min(minutes, 20 * 60) % 60).padStart(2, "0")}`;

      closed.push({
        id: `ord-h${step}`,
        number: "",
        clientId,
        vehicleId,
        liftId: back === 0 ? undefined : (index % 5) + 1,
        status: "выдан",
        createdAt: at(-back, clock(startMinutes)),
        plannedAt: day(-back),
        completedAt: at(-back, clock(startMinutes + actual)),
        timeline: [
          { status: "запись" as const, at: at(-back, clock(startMinutes - 30)) },
          { status: "в работе" as const, at: at(-back, clock(startMinutes)) },
          { status: "готово" as const, at: at(-back, clock(startMinutes + actual)) },
          { status: "выдан" as const, at: at(-back, clock(startMinutes + actual + 20)) },
        ],
        advisor: step % 2 === 0 ? "Игорь" : "Юра",
        scheduledStart: back === 0 ? undefined : clock(startMinutes),
        scheduledEnd: back === 0 ? undefined : clock(startMinutes + 150),
        works,
        parts,
        discount: discount || undefined,
        paid,
        guaranteeMonths: 6,
      });

      revenueSincePurchase += due;
      step += 1;
    }

    // Закупка запчастей раз в пару дней — около четверти выручки за это время.
    if (lastPurchaseDay - back >= 2) {
      const amount = Math.max(6000, Math.round((revenueSincePurchase * 0.25) / 100) * 100);
      expenses.push({
        id: `ex-parts-${back}`,
        date: day(-back),
        category: "Закупка запчастей",
        description: "Поставка запчастей и расходников",
        amount,
        counterparty: expenses.length % 2 === 0 ? "Exist.ru" : "Автодок",
        status: "Оплачено",
        comment: `Накладная №${20000 + back}`,
      });
      movements.push({
        id: `mv-in-${back}`,
        date: at(-back, "10:15"),
        itemId: `st-${(back % 15) + 1}`,
        operation: "Приёмка",
        qty: 4 + (back % 6),
        to: "A-01-01",
        employee: back % 2 === 0 ? "Юра" : "Игорь",
        amount: Math.round(amount / 4),
      });
      revenueSincePurchase = 0;
      lastPurchaseDay = back;
    }

    // Постоянные расходы — пятого числа каждого месяца.
    const date = new Date(day(-back));
    if (date.getDate() === 3) {
      const month = `${date.getFullYear()}-${date.getMonth()}`;
      expenses.push(
        { id: `ex-rent-${month}`, date: day(-back), category: "Аренда", description: "Аренда гаражей 563–564", amount: 60000, counterparty: "Аренда 42Г", status: "Оплачено" },
        { id: `ex-util-${month}`, date: day(-back), category: "Коммунальные услуги", description: "Электричество и вода", amount: 9400, counterparty: "Мосэнергосбыт", status: "Оплачено" },
        { id: `ex-ads-${month}`, date: day(-back), category: "Реклама", description: "Продвижение на Яндекс Картах и Авито", amount: 12000, counterparty: "Яндекс", status: "Оплачено" },
        { id: `ex-tool-${month}`, date: day(-back), category: "Инструмент", description: "Расходный инструмент и химия", amount: 7600, counterparty: "Инструмент-Центр", status: "Оплачено" },
      );
    }

    if (!workingDay) step += 1;
  }

  return { closed, expenses, movements };
}


/** Записи на ближайшую неделю — чтобы расписание было наполнено и вперёд. */
const BOOKING_TEMPLATES: { works: [string, number][]; note: string }[] = [
  { works: [["Замена масла в ДВС", 1200], ["Замена масляного фильтра", 600]], note: "ТО по пробегу" },
  { works: [["Развал-схождение", 2500]], note: "Уводит вправо после ям" },
  { works: [["Компьютерная диагностика", 1500]], note: "Горит Check Engine" },
  { works: [["Замена передних тормозных колодок", 2000], ["Замена тормозных дисков (пара)", 3000]], note: "Скрип при торможении" },
  { works: [["Заправка кондиционера", 3200]], note: "Плохо холодит" },
  { works: [["Шиномонтаж (4 колеса)", 2400]], note: "Переобувка на зиму" },
  { works: [["Замена масла в АКПП", 4200]], note: "Толчки при переключении" },
  { works: [["Замена ступичного подшипника", 3800]], note: "Гул на скорости" },
];

const BOOKING_SLOTS: [string, string][] = [["10:00", "12:00"], ["12:30", "15:00"], ["15:30", "18:00"]];

function bookings(): Order[] {
  const result: Order[] = [];
  let step = 0;
  for (let ahead = 1; ahead <= 7; ahead += 1) {
    const weekday = new Date(day(ahead)).getDay();
    if (weekday === 0) continue;
    const perDay = 2 + (ahead % 2);
    for (let index = 0; index < perDay; index += 1) {
      const template = BOOKING_TEMPLATES[step % BOOKING_TEMPLATES.length];
      const pair = CLOSED_PAIRS[(step * 3 + 1) % CLOSED_PAIRS.length];
      const [scheduledStart, scheduledEnd] = BOOKING_SLOTS[index % BOOKING_SLOTS.length];
      result.push({
        id: `ord-b${step}`,
        number: "",
        clientId: pair.clientId,
        vehicleId: pair.vehicleId,
        liftId: (index % 5) + 1,
        status: "запись",
        createdAt: at(0, `${String(10 + (step % 6)).padStart(2, "0")}:15`),
        plannedAt: day(ahead),
        advisor: step % 2 === 0 ? "Игорь" : "Юра",
        scheduledStart,
        scheduledEnd,
        works: template.works.map(([name, price], i) => ({ id: `w${i + 1}`, name, qty: 1, price })),
        parts: [],
        paid: 0,
        complaint: template.note,
      });
      step += 1;
    }
  }
  return result;
}

const history = buildHistory();
const planned = bookings();

/**
 * Демо-выплаты: сдельную часть считаем закрытой по заказам старше двух недель,
 * оклад — помесячно. Так на странице «Сотрудники» видно и выплаченное, и остаток.
 */
const PAYOUT_CUTOFF = day(-14);

function payoutsAndSalaries(): { employees: Employee[]; expenses: Expense[] } {
  const settled = history.closed.filter((order) => (order.plannedAt ?? order.createdAt) < PAYOUT_CUTOFF);
  const expenses: Expense[] = [];

  const employees = employeeList.map((employee) => {
    if (employee.payType === "salary") return employee;
    const revenue = settled
      .flatMap((order) => order.works)
      .filter((work) => work.executor === employee.name)
      .reduce((sum, work) => sum + work.price * work.qty, 0);
    const paid = Math.round((revenue * employee.payValue) / 100);
    if (paid > 0) {
      expenses.push({
        id: `ex-pay-${employee.id}`,
        date: PAYOUT_CUTOFF,
        category: "Зарплата",
        description: `Выплата: ${employee.name}`,
        amount: paid,
        counterparty: employee.name,
        status: "Оплачено",
        source: "payroll",
        employeeId: employee.id,
      });
    }
    return { ...employee, paid, lastPaidAt: paid > 0 ? `${PAYOUT_CUTOFF}T18:00:00` : undefined };
  });

  // Оклад администратора — обычный расход, он не проходит через начисление.
  const salaried = employees.filter((employee) => employee.payType === "salary");
  let months = 0;
  for (let back = HISTORY_DAYS; back >= 1; back -= 1) {
    const date = new Date(day(-back));
    if (date.getDate() !== 10) continue;
    months += 1;
    for (const employee of salaried) {
      expenses.push({
        id: `ex-salary-${employee.id}-${back}`,
        date: day(-back),
        category: "Зарплата",
        description: `Оклад: ${employee.name}`,
        amount: employee.payValue,
        counterparty: employee.name,
        status: "Оплачено",
        employeeId: employee.id,
      });
    }
  }

  return {
    employees: employees.map((employee) =>
      employee.payType === "salary"
        ? { ...employee, paid: employee.payValue * months, lastPaidAt: months ? `${day(-10)}T18:00:00` : undefined }
        : employee,
    ),
    expenses,
  };
}

const payroll = payoutsAndSalaries();

export const employees: Employee[] = payroll.employees;

/** Сквозная нумерация по дате создания: старые заказы получают меньшие номера. */
function numbered(list: Order[], offset: number): Order[] {
  return [...list]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((order, index) => ({ ...order, number: `№АИ-${String(offset + index + 1).padStart(4, "0")}` }));
}

export const orders: Order[] = [
  ...numbered(planned, history.closed.length + activeOrders.length),
  ...numbered(activeOrders, history.closed.length),
  ...numbered(history.closed, 0).reverse(),
];

/**
 * Демо-платежи специально содержат разные способы оплаты и сотрудников,
 * чтобы блок «Сверка оплат» и история заказа были понятны сразу после запуска.
 */
export const payments: Payment[] = orders.flatMap((order, index) => {
  const paid = Math.max(0, order.paid ?? 0);
  if (paid <= 0) return [];

  const at =
    [...(order.timeline ?? [])].reverse().find((event) => event.status === "выдан")?.at
    ?? order.completedAt
    ?? order.createdAt;
  const employee = order.advisor ?? (index % 2 === 0 ? "Игорь" : "Юра");
  const methods = ["cash", "terminal", "transfer"] as const;

  // Иногда клиент платит двумя способами — показываем реальный сценарий.
  if (paid >= 2_000 && index % 5 === 0) {
    const cash = Math.round((paid * 0.4) / 100) * 100;
    return [
      {
        id: `seed-pay-${order.id}-cash`,
        orderId: order.id,
        at,
        amount: cash,
        kind: "payment" as const,
        method: "cash" as const,
        employee,
      },
      {
        id: `seed-pay-${order.id}-card`,
        orderId: order.id,
        at,
        amount: paid - cash,
        kind: "payment" as const,
        method: "terminal" as const,
        employee,
      },
    ];
  }

  return [{
    id: `seed-pay-${order.id}`,
    orderId: order.id,
    at,
    amount: paid,
    kind: "payment" as const,
    method: methods[index % methods.length],
    employee,
  }];
});

const recentMovements: StockMovement[] = [
  { id: "mv-1", date: at(0, "12:36"), itemId: "st-1", operation: "Приёмка", qty: 4, to: "A-03-02", employee: "Юра", amount: 13000 },
  { id: "mv-2", date: at(0, "11:02"), itemId: "st-2", operation: "Перемещение", qty: 2, from: "B-01-01", to: "A-01-02", employee: "Механик 1" },
  { id: "mv-3", date: at(-1, "09:17"), itemId: "st-4", operation: "Приёмка", qty: 8, to: "B-02-01", employee: "Игорь", amount: 2800 },
  { id: "mv-4", date: at(-2, "16:21"), itemId: "st-7", operation: "Списание", qty: 1, from: "A-02-02", employee: "Механик 2" },
];

export const stockMovements: StockMovement[] = [...recentMovements, ...history.movements]
  .sort((a, b) => b.date.localeCompare(a.date));

export const expenses: Expense[] = [...history.expenses, ...payroll.expenses]
  .sort((a, b) => b.date.localeCompare(a.date))
  .map((expense, index) => ({ ...expense, code: `Р-${String(index + 1).padStart(4, "0")}` }));

export const invoices: Invoice[] = [
  { id: "inv-1", number: "СЧ-001", clientId: "cl-2", orderId: "ord-268", amount: 19710, status: "Выставлен", issuedAt: day(0) },
  { id: "inv-2", number: "СЧ-002", clientId: "cl-3", orderId: "ord-267", amount: 1800, status: "Выставлен", issuedAt: day(0) },
];
