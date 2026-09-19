import assert from "node:assert/strict";
import test from "node:test";
import { findClientByPhone, findVehicleByPlate, findVehicleByVin } from "../src/lib/dataIntegrity.ts";
import type { Client, Vehicle } from "../src/types.ts";

const clients: Client[] = [
  { id: "c1", name: "Иван", phone: "+7 (999) 111-22-33" },
  { id: "c2", name: "Пётр", phone: "+7 (999) 444-55-66" },
];

const vehicles: Vehicle[] = [
  { id: "v1", clientId: "c1", make: "BMW", model: "X3", plate: "А123ВС 797", vin: "WBAVM31020VJ99465" },
  { id: "v2", clientId: "c2", make: "Kia", model: "Rio", plate: "В777ОР 77" },
];

test("findClientByPhone normalizes phone format", () => {
  assert.equal(findClientByPhone(clients, "8 999 111 22 33")?.id, "c1");
  assert.equal(findClientByPhone(clients, "+79991112233", "c1"), undefined);
});

test("findVehicleByPlate normalizes Russian plate", () => {
  assert.equal(findVehicleByPlate(vehicles, "A123BC797")?.id, "v1");
  assert.equal(findVehicleByPlate(vehicles, "А123ВС797", "v1"), undefined);
});

test("findVehicleByVin is case-insensitive through normalization", () => {
  assert.equal(findVehicleByVin(vehicles, "wbavm31020vj99465")?.id, "v1");
  assert.equal(findVehicleByVin(vehicles, "WBAVM31020VJ99465", "v1"), undefined);
});
