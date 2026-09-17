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
  { id: "cl-1", name: "Смирнов Алексей", phone: "+7 916 000-00-01", isRegular: true, discountPercent: 5, source: "Сарафанное радио", createdAt: "2024-03-12", birthday: "1988-06-04", notes: "Приезжает по субботам, просит звонить заранее" },
  { id: "cl-2", name: "Кузнецова Мария", phone: "+7 916 000-00-02", isRegular: true, discountPercent: 5, source: "Яндекс Карты", createdAt: "2024-08-01", email: "kuznecova@example.com" },
  { id: "cl-3", name: "Волков Дмитрий", phone: "+7 916 000-00-03", source: "Авито", createdAt: "2025-05-20" },
  { id: "cl-4", name: "Лебедев Сергей", phone: "+7 916 000-00-04", createdAt: "2026-02-11" },
  { id: "cl-5", name: "Панфилова Елена", phone: "+7 916 000-00-05", createdAt: "2026-09-01" },
];

export const vehicles: Vehicle[] = [
  { id: "veh-1", clientId: "cl-1", make: "Toyota", model: "Camry", plate: "A123BC 797", mileage: 82000, year: 2019, color: "Чёрный", engine: "2.5 бензин", transmission: "АКПП", nextServiceMileage: 92000, nextServiceDate: "2026-12-01" },
  { id: "veh-2", clientId: "cl-2", make: "Kia", model: "Sportage", plate: "H456MK 799", mileage: 78460, vin: "XWEPH81ADMN123456", year: 2021, color: "Белый", engine: "2.0 дизель", transmission: "АКПП" },
  { id: "veh-3", clientId: "cl-3", make: "BMW", model: "X5", plate: "O789KX 777", mileage: 145000, year: 2016, color: "Синий", engine: "3.0 дизель", transmission: "АКПП" },
  { id: "veh-4", clientId: "cl-4", make: "Hyundai", model: "Solaris", plate: "K222TT 750" },
  { id: "veh-5", clientId: "cl-5", make: "Skoda", model: "Octavia", plate: "M333EE 197" },
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
  { id: "st-1", name: "Тормозные колодки (передние)", sku: "GDB1956", brand: "TRW", category: "Тормозная система", qty: 2, minQty: 5, purchasePrice: 3250, cell: "A-03-02", unit: "компл." },
  { id: "st-2", name: "Масляный фильтр (VAG)", sku: "26300-35505", brand: "MANN", category: "Фильтры", qty: 3, minQty: 5, purchasePrice: 980, cell: "A-01-02", unit: "шт." },
  { id: "st-3", name: "Моторное масло 5W-30", sku: "Shell 5W-30", brand: "Shell", category: "Масла", qty: 4, minQty: 10, purchasePrice: 850, cell: "B-04-01", unit: "л" },
  { id: "st-4", name: "Свечи зажигания (NGK)", sku: "BKR6E", brand: "NGK", category: "Электрика", qty: 2, minQty: 10, purchasePrice: 350, cell: "B-02-01", unit: "шт." },
  { id: "st-5", name: "Антифриз G12+", sku: "G12+", brand: "Felix", category: "Жидкости", qty: 5, minQty: 10, purchasePrice: 650, cell: "B-04-02", unit: "л" },
  { id: "st-6", name: "Воздушный фильтр", sku: "28113-D3100", brand: "MANN", category: "Фильтры", qty: 1, minQty: 5, purchasePrice: 1250, cell: "A-04-01", unit: "шт." },
  { id: "st-7", name: "Тормозной диск передний", sku: "DF4271", brand: "TRW", category: "Тормозная система", qty: 2, minQty: 4, purchasePrice: 4900, cell: "A-02-02", unit: "шт." },
];

export const stockMovements: StockMovement[] = [
  { id: "mv-1", date: "2026-09-14T12:36:00", itemId: "st-1", operation: "Приёмка", qty: 4, to: "A-03-02", employee: "Юра" },
  { id: "mv-2", date: "2026-09-14T11:02:00", itemId: "st-2", operation: "Перемещение", qty: 2, from: "B-01-01", to: "A-01-02", employee: "Механик 1" },
  { id: "mv-3", date: "2026-09-14T09:17:00", itemId: "st-4", operation: "Приёмка", qty: 8, to: "B-02-01", employee: "Игорь" },
  { id: "mv-4", date: "2026-09-13T16:21:00", itemId: "st-7", operation: "Списание", qty: 1, from: "A-02-02", employee: "Механик 2" },
];

export const orders: Order[] = [
  {
    id: "ord-268",
    number: "№АИ-0268",
    clientId: "cl-2",
    vehicleId: "veh-2",
    liftId: 2,
    status: "в работе",
    createdAt: "2026-09-14T09:30:00",
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
    createdAt: "2026-09-14T09:00:00",
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
    createdAt: "2026-09-14T09:00:00",
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
    status: "ожидает запчасти",
    createdAt: "2026-09-14T13:00:00",
    advisor: "Юра",
    works: [],
    parts: [],
    paid: 0,
  },
  {
    id: "ord-263",
    number: "№АИ-0263",
    clientId: "cl-5",
    vehicleId: "veh-5",
    status: "в работе",
    createdAt: "2026-09-14T11:00:00",
    advisor: "Игорь",
    works: [],
    parts: [],
    paid: 0,
  },
];

export const expenses: Expense[] = [
  { id: "ex-1", date: "2026-09-14", category: "Закупка запчастей", description: "Поставка тормозных дисков и колодок", amount: 85400, counterparty: "Exist.ru", status: "Оплачено", comment: "Накладная №24567" },
  { id: "ex-2", date: "2026-09-12", category: "Аренда", description: "Аренда гаража за сентябрь", amount: 120000, counterparty: "Аренда 42Г", status: "Оплачено" },
  { id: "ex-3", date: "2026-09-10", category: "Закупка запчастей", description: "Масла, фильтры, техжидкости", amount: 63200, counterparty: "Автодок", status: "Оплачено", comment: "Накладная №22345" },
];

export const invoices: Invoice[] = [
  { id: "inv-1", number: "СЧ-001", clientId: "cl-2", orderId: "ord-268", amount: 19710, status: "Выставлен", issuedAt: "2026-09-14" },
  { id: "inv-2", number: "СЧ-002", clientId: "cl-3", orderId: "ord-267", amount: 1800, status: "Выставлен", issuedAt: "2026-09-14" },
];
