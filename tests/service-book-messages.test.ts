import assert from "node:assert/strict";
import test from "node:test";
import { readyMessage, smsMessageHref, whatsappMessageHref } from "../src/lib/customerMessages.ts";
import { issuedVehicleOrders, vehicleOrders, vehicleServiceStats } from "../src/lib/serviceBook.ts";
import type { Order } from "../src/types.ts";

const orders: Order[] = [
  {
    id: "o1", number: "№1", clientId: "c", vehicleId: "v1", status: "выдан",
    createdAt: "2026-09-01T10:00:00", issuedAt: "2026-09-01T12:00:00",
    works: [{ id: "w1", name: "Замена масла", qty: 1, price: 1200 }],
    parts: [{ id: "p1", name: "Масло", qty: 4, unit: "л", price: 1000, availability: "in_stock" }],
    paid: 5200,
  },
  {
    id: "o2", number: "№2", clientId: "c", vehicleId: "v1", status: "в работе",
    createdAt: "2026-09-10T10:00:00",
    works: [{ id: "w2", name: "Диагностика", qty: 1, price: 1500 }],
    parts: [],
    paid: 0,
  },
  {
    id: "o3", number: "№3", clientId: "c", vehicleId: "v2", status: "выдан",
    createdAt: "2026-08-01T10:00:00",
    works: [], parts: [], paid: 0,
  },
];

test("service book keeps only selected vehicle and counts issued history", () => {
  assert.deepEqual(vehicleOrders(orders, "v1").map((order) => order.id), ["o2", "o1"]);
  assert.deepEqual(issuedVehicleOrders(orders, "v1").map((order) => order.id), ["o1"]);
  const stats = vehicleServiceStats(orders, "v1");
  assert.equal(stats.totalOrders, 2);
  assert.equal(stats.issuedOrders, 1);
  assert.equal(stats.spent, 5200);
  assert.equal(stats.works, 1);
  assert.equal(stats.parts, 4);
});

test("ready message generates direct WhatsApp and SMS links", () => {
  const message = readyMessage({
    clientName: "Сергей",
    vehicle: "Hyundai Solaris",
    orderNumber: "№АИ-0341",
    serviceName: "The Service",
    phone: "+7 (999) 096-08-46",
  });
  assert.match(message, /Hyundai Solaris/);
  assert.match(message, /готов/);
  assert.match(whatsappMessageHref("+7 (916) 000-00-04", message), /^https:\/\/wa\.me\/79160000004\?text=/);
  assert.match(smsMessageHref("+7 (916) 000-00-04", message), /^sms:\+79160000004\?body=/);
});
