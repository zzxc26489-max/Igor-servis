import assert from "node:assert/strict";
import test from "node:test";
import { serviceReminder, serviceReminders } from "../src/lib/serviceReminder.ts";
import type { Vehicle } from "../src/types.ts";

const base: Vehicle = {
  id: "v1",
  clientId: "c1",
  make: "Hyundai",
  model: "Solaris",
  plate: "A123AA77",
  mileage: 100000,
};

test("service reminder marks overdue date first", () => {
  const item = serviceReminder(
    { ...base, nextServiceDate: "2026-09-10" },
    new Date("2026-09-19T12:00:00"),
  );
  assert.equal(item?.tone, "overdue");
  assert.match(item?.label ?? "", /просрочена/);
});

test("service reminder appears within 30 days or 1000 km", () => {
  const byDate = serviceReminder(
    { ...base, nextServiceDate: "2026-10-01" },
    new Date("2026-09-19T12:00:00"),
  );
  assert.equal(byDate?.tone, "soon");

  const byMileage = serviceReminder(
    { ...base, nextServiceMileage: 100700 },
    new Date("2026-09-19T12:00:00"),
  );
  assert.equal(byMileage?.tone, "soon");
  assert.match(byMileage?.label ?? "", /700 км/);
});

test("service reminders ignore distant maintenance and sort overdue before soon", () => {
  const distant = { ...base, id: "far", nextServiceMileage: 105000 };
  const soon = { ...base, id: "soon", nextServiceMileage: 100500 };
  const overdue = { ...base, id: "late", nextServiceMileage: 99000 };
  const rows = serviceReminders([soon, distant, overdue], new Date("2026-09-19T12:00:00"));
  assert.deepEqual(rows.map((item) => item.vehicleId), ["late", "soon"]);
});
