import type {
  Client,
  Employee,
  Expense,
  Invoice,
  Lift,
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
  return date.toISOString().slice(0, 10);
}

function at(offset: number, time: string) {
  return `${day(offset)}T${time}:00`;
}

export const lifts: Lift[] = [
  { id: 1, name: "Подъёмник 1", status: "busy" },
  { id: 2, name: "Подъёмник 2", status: "busy" },
  { id: 3, name: "Подъёмник 3", status: "free" },
  { id: 4, name: "Подъёмник 4", status: "busy" },
  { id: 5, name: "Подъёмник 5", status: "free" },
];

export const employees: Employee[] = [
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
    payValue: 0,
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
  { id: "cl-1", code: "К-0001", name: "Смирнов Алексей", phone: "+7 916 000-00-01", isRegular: true, discountPercent: 5, source: "Сарафанное радио", createdAt: day(-900), birthday: "1988-06-04", notes: "Приезжает по субботам, просит звонить заранее" },
  { id: "cl-2", code: "К-0002", name: "Кузнецова Мария", phone: "+7 916 000-00-02", isRegular: true, discountPercent: 5, source: "Яндекс Карты", createdAt: day(-760), email: "kuznecova@example.com" },
  { id: "cl-3", code: "К-0003", name: "Волков Дмитрий", phone: "+7 916 000-00-03", source: "Авито", createdAt: day(-480) },
  { id: "cl-4", code: "К-0004", name: "Лебедев Сергей", phone: "+7 916 000-00-04", createdAt: day(-210) },
  { id: "cl-5", code: "К-0005", name: "Панфилова Елена", phone: "+7 916 000-00-05", createdAt: day(-20) },
];

export const vehicles: Vehicle[] = [
  { id: "veh-1", code: "А-0001", clientId: "cl-1", make: "Toyota", model: "Camry", plate: "A123BC 797", mileage: 82000, year: 2019, color: "Чёрный", engine: "2.5 бензин", transmission: "АКПП", nextServiceMileage: 92000, nextServiceDate: day(74) },
  { id: "veh-2", code: "А-0002", clientId: "cl-2", make: "Kia", model: "Sportage", plate: "H456MK 799", mileage: 78460, vin: "XWEPH81ADMN123456", year: 2021, color: "Белый", engine: "2.0 дизель", transmission: "АКПП" },
  { id: "veh-3", code: "А-0003", clientId: "cl-3", make: "BMW", model: "X5", plate: "O789KX 777", mileage: 145000, year: 2016, color: "Синий", engine: "3.0 дизель", transmission: "АКПП" },
  { id: "veh-4", code: "А-0004", clientId: "cl-4", make: "Hyundai", model: "Solaris", plate: "K222TT 750" },
  { id: "veh-5", code: "А-0005", clientId: "cl-5", make: "Skoda", model: "Octavia", plate: "M333EE 197" },
];

export const services: Service[] = [
  { id: "sv-1", name: "Компьютерная диагностика", category: "Диагностика", price: 1500 },
  { id: "sv-2", name: "Замена масла в ДВС", category: "ТО", price: 1200 },
  { id: "sv-3", name: "Замена масляного фильтра", category: "ТО", price: 600 },
  { id: "sv-4", name: "Замена воздушного фильтра", category: "ТО", price: 400 },
  { id: "sv-5", name: "Замена передних тормозных колодок", category: "Тормозная система", price: 2000 },
  { id: "sv-6", name: "Замена термостата", category: "Охлаждение", price: 1800 },
  { id: "sv-7", name: "Развал-схождение", category: "Ходовая", price: 2500 },
];

export const stock: StockItem[] = [
  { id: "st-1", code: "С-0001", name: "Тормозные колодки (передние)", sku: "GDB1956", brand: "TRW", category: "Тормозная система", qty: 2, minQty: 4, purchasePrice: 3250, cell: "A-03-02", unit: "компл." },
  { id: "st-2", code: "С-0002", name: "Масляный фильтр (VAG)", sku: "26300-35505", brand: "MANN", category: "Фильтры", qty: 6, minQty: 3, purchasePrice: 980, cell: "A-01-02", unit: "шт." },
  { id: "st-3", code: "С-0003", name: "Моторное масло 5W-30", sku: "Shell 5W-30", brand: "Shell", category: "Масла", qty: 18, minQty: 8, purchasePrice: 850, cell: "B-04-01", unit: "л" },
  { id: "st-4", code: "С-0004", name: "Свечи зажигания (NGK)", sku: "BKR6E", brand: "NGK", category: "Электрика", qty: 16, minQty: 8, purchasePrice: 350, cell: "B-02-01", unit: "шт." },
  { id: "st-5", code: "С-0005", name: "Антифриз G12+", sku: "G12+", brand: "Felix", category: "Жидкости", qty: 12, minQty: 6, purchasePrice: 650, cell: "B-04-02", unit: "л" },
  { id: "st-6", code: "С-0006", name: "Воздушный фильтр", sku: "28113-D3100", brand: "MANN", category: "Фильтры", qty: 1, minQty: 3, purchasePrice: 1250, cell: "A-04-01", unit: "шт." },
  { id: "st-7", code: "С-0007", name: "Тормозной диск передний", sku: "DF4271", brand: "TRW", category: "Тормозная система", qty: 4, minQty: 2, purchasePrice: 4900, cell: "A-02-02", unit: "шт." },
];

export const stockMovements: StockMovement[] = [
  { id: "mv-1", date: at(0, "12:36"), itemId: "st-1", operation: "Приёмка", qty: 4, to: "A-03-02", employee: "Юра" },
  { id: "mv-2", date: at(0, "11:02"), itemId: "st-2", operation: "Перемещение", qty: 2, from: "B-01-01", to: "A-01-02", employee: "Механик 1" },
  { id: "mv-3", date: at(-1, "09:17"), itemId: "st-4", operation: "Приёмка", qty: 8, to: "B-02-01", employee: "Игорь" },
  { id: "mv-4", date: at(-2, "16:21"), itemId: "st-7", operation: "Списание", qty: 1, from: "A-02-02", employee: "Механик 2" },
];

const activeOrders: Order[] = [
  {
    id: "ord-268",
    number: "№АИ-0268",
    clientId: "cl-2",
    vehicleId: "veh-2",
    liftId: 2,
    status: "в работе",
    createdAt: at(0, "09:30"), plannedAt: day(0),
    advisor: "Игорь",
    scheduledStart: "10:00",
    scheduledEnd: "14:00",
    works: [
      { id: "w1", name: "Компьютерная диагностика", qty: 1, price: 1500, executor: "Игорь" },
      { id: "w2", name: "Замена масла в ДВС", qty: 1, price: 1200, executor: "Механик 1" },
      { id: "w3", name: "Замена передних тормозных колодок", qty: 1, price: 2000, executor: "Механик 1" },
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
    number: "№АИ-0267",
    clientId: "cl-3",
    vehicleId: "veh-3",
    liftId: 4,
    status: "в работе",
    createdAt: at(0, "09:00"), plannedAt: day(0),
    advisor: "Юра",
    scheduledStart: "09:30",
    scheduledEnd: "12:30",
    works: [{ id: "w1", name: "Замена термостата", qty: 1, price: 1800, executor: "Механик 2" }],
    parts: [],
    paid: 0,
  },
  {
    id: "ord-265",
    number: "№АИ-0265",
    clientId: "cl-1",
    vehicleId: "veh-1",
    liftId: 1,
    status: "в работе",
    createdAt: at(0, "09:00"), plannedAt: day(0),
    advisor: "Игорь",
    scheduledStart: "09:00",
    scheduledEnd: "12:00",
    works: [
      { id: "w1", name: "Замена масла в ДВС", qty: 1, price: 1200 },
      { id: "w2", name: "Компьютерная диагностика", qty: 1, price: 1500 },
    ],
    parts: [],
    paid: 0,
  },
  {
    id: "ord-264",
    number: "№АИ-0264",
    clientId: "cl-4",
    vehicleId: "veh-4",
    liftId: 3,
    status: "готово",
    createdAt: at(0, "08:40"), plannedAt: day(0),
    advisor: "Юра",
    scheduledStart: "08:40",
    scheduledEnd: "10:10",
    works: [
      { id: "w1", name: "Замена масла в ДВС", qty: 1, price: 1200, executor: "Механик 2" },
      { id: "w2", name: "Замена масляного фильтра", qty: 1, price: 600, executor: "Механик 2" },
    ],
    parts: [{ id: "p1", name: "Моторное масло 5W-30", sku: "Shell 5W-30", qty: 4, price: 1100, availability: "in_stock" }],
    paid: 0,
    completedAt: at(0, "10:10"),
    notes: "Готово к выдаче, клиент обещал забрать после 17:00.",
  },
  {
    id: "ord-263",
    number: "№АИ-0263",
    clientId: "cl-5",
    vehicleId: "veh-5",
    status: "ожидает запчасти",
    createdAt: at(-1, "11:00"), plannedAt: day(0),
    advisor: "Игорь",
    works: [{ id: "w1", name: "Замена передних тормозных колодок", qty: 1, price: 2000 }],
    parts: [{ id: "p1", name: "Тормозной диск передний", sku: "DF4271", qty: 2, price: 6200, availability: "ordered" }],
    paid: 0,
    notes: "Диски в пути, поставщик обещал завтра к обеду.",
  },
  {
    id: "ord-262",
    number: "№АИ-0262",
    clientId: "cl-1",
    vehicleId: "veh-1",
    status: "готово",
    createdAt: at(-1, "09:20"), plannedAt: day(-1),
    advisor: "Игорь",
    works: [{ id: "w1", name: "Развал-схождение", qty: 1, price: 2500, executor: "Механик 1" }],
    parts: [],
    paid: 1000,
    completedAt: at(-1, "12:40"),
    notes: "Оплачена часть суммы, остаток при выдаче.",
  },
];


/**
 * Закрытые заказы за последние недели генерируем: так аналитика, отчёты и график
 * всегда наполнены, а править руками полсотни записей не нужно.
 */
const CLOSED_TEMPLATES: { works: [string, number][]; parts: [string, string, number, number][] }[] = [
  {
    works: [["Замена масла в ДВС", 1200], ["Замена масляного фильтра", 600], ["Замена воздушного фильтра", 400]],
    parts: [["Моторное масло 5W-30", "Shell 5W-30", 5, 1100], ["Масляный фильтр (VAG)", "26300-35505", 1, 1400]],
  },
  {
    works: [["Замена передних тормозных колодок", 2000], ["Развал-схождение", 2500]],
    parts: [["Тормозные колодки (передние)", "GDB1956", 1, 4200]],
  },
  {
    works: [["Компьютерная диагностика", 1500], ["Замена термостата", 1800]],
    parts: [["Антифриз G12+", "G12+", 5, 900]],
  },
  {
    works: [["Замена передних тормозных колодок", 2000]],
    parts: [["Тормозной диск передний", "DF4271", 2, 6200], ["Тормозные колодки (передние)", "GDB1956", 1, 4200]],
  },
  {
    works: [["Компьютерная диагностика", 1500]],
    parts: [],
  },
  {
    works: [["Замена масла в ДВС", 1200], ["Замена воздушного фильтра", 400]],
    parts: [["Свечи зажигания (NGK)", "BKR6E", 4, 620], ["Воздушный фильтр", "28113-D3100", 1, 1800]],
  },
];

const CLOSED_PAIRS: [string, string][] = [
  ["cl-1", "veh-1"], ["cl-2", "veh-2"], ["cl-3", "veh-3"], ["cl-4", "veh-4"], ["cl-5", "veh-5"],
];

function closedOrders(): Order[] {
  const result: Order[] = [];
  let number = 224;
  // По 1–2 закрытых заказа на рабочий день за последний месяц.
  for (let back = 30; back >= 2; back -= 1) {
    const weekday = new Date(day(-back)).getDay();
    if (weekday === 0) continue; // воскресенье — выходной
    const perDay = back % 3 === 0 ? 2 : 1;
    for (let index = 0; index < perDay; index += 1) {
      const template = CLOSED_TEMPLATES[(back + index) % CLOSED_TEMPLATES.length];
      const [clientId, vehicleId] = CLOSED_PAIRS[(back + index * 2) % CLOSED_PAIRS.length];
      const works = template.works.map(([name, price], i) => ({
        id: `w${i + 1}`,
        name,
        qty: 1,
        price,
        executor: (back + i) % 2 === 0 ? "Механик 1" : "Механик 2",
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
      const startHour = 9 + index * 4;
      result.push({
        id: `ord-${number}`,
        number: `№АИ-${String(number).padStart(4, "0")}`,
        clientId,
        vehicleId,
        status: "выдан",
        createdAt: at(-back, `${String(startHour).padStart(2, "0")}:00`),
        plannedAt: day(-back),
        completedAt: at(-back, `${String(startHour + 3).padStart(2, "0")}:30`),
        advisor: back % 2 === 0 ? "Игорь" : "Юра",
        works,
        parts,
        paid: total,
      });
      number += 1;
    }
  }
  return result;
}

export const orders: Order[] = [...activeOrders, ...closedOrders()];

export const expenses: Expense[] = [
  { id: "ex-1", code: "Р-0001", date: day(-2), category: "Закупка запчастей", description: "Поставка тормозных дисков и колодок", amount: 38400, counterparty: "Exist.ru", status: "Оплачено", comment: "Накладная №24567" },
  { id: "ex-2", code: "Р-0002", date: day(-3), category: "Аренда", description: "Аренда гаража за месяц", amount: 60000, counterparty: "Аренда 42Г", status: "Оплачено" },
  { id: "ex-3", code: "Р-0003", date: day(-11), category: "Закупка запчастей", description: "Масла, фильтры, техжидкости", amount: 29800, counterparty: "Автодок", status: "Оплачено", comment: "Накладная №22345" },
];

export const invoices: Invoice[] = [
  { id: "inv-1", number: "СЧ-001", clientId: "cl-2", orderId: "ord-268", amount: 19710, status: "Выставлен", issuedAt: day(0) },
  { id: "inv-2", number: "СЧ-002", clientId: "cl-3", orderId: "ord-267", amount: 1800, status: "Выставлен", issuedAt: day(0) },
];
