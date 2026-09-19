import { useMemo, useRef, useState } from "react";
import { IconSearch } from "@tabler/icons-react";
import { Button, Modal } from "../components/ui";
import { useAppStore } from "../store/AppStore";
import { formatMoney } from "../lib/format";
import { isValidMoney, moneyInput } from "../lib/formats";
import { formatDuration } from "../lib/worktime";
import { mechanicCandidates, mechanicWorkloadLabel } from "../lib/mechanicWorkload";
import type { Service } from "../types";
import { createId } from "../lib/id";

export interface NewWork {
  id: string;
  name: string;
  qty: number;
  price: number;
  executor?: string;
  normMinutes?: number;
}

/** Подбор работы: поиск и категории вместо одного длинного списка. */
export default function AddWork({ onClose, onSubmit }: { onClose: () => void; onSubmit: (work: NewWork) => void }) {
  const { services, employees, orders } = useAppStore();

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [selected, setSelected] = useState<Service | null>(null);
  const [custom, setCustom] = useState(false);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [norm, setNorm] = useState("");
  const [qty, setQty] = useState("1");
  const [executor, setExecutor] = useState("");
  const workIdRef = useRef(createId("work"));
  const submittedRef = useRef(false);

  const categories = useMemo(
    () => ["all", ...Array.from(new Set(services.map((item) => item.category))).sort()],
    [services],
  );

  const found = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("ru-RU");
    return services
      .filter((item) => {
        if (category !== "all" && item.category !== category) return false;
        if (!term) return true;
        return `${item.name} ${item.category}`.toLocaleLowerCase("ru-RU").includes(term);
      })
      .sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }, [category, query, services]);

  function pick(service: Service) {
    setSelected(service);
    setCustom(false);
    setName(service.name);
    setPrice(String(service.price));
    setNorm(service.normMinutes ? String(service.normMinutes) : "");
    setQty("1");
  }

  function startCustom() {
    setCustom(true);
    setSelected(null);
    setName(query.trim());
    setPrice("");
    setNorm("");
    setQty("1");
  }

  const chosen = selected || custom;
  const numericQty = Number(qty);
  const validQty = Number.isInteger(numericQty) && numericQty > 0;
  const count = validQty ? numericQty : 0;
  const validPrice = isValidMoney(price);
  const total = (Number(price) || 0) * count;

  return (
    <Modal
      title={chosen ? "Параметры работы" : "Работа из прайса"}
      subtitle={chosen ? (selected?.name ?? "Своя работа") : "Найдите услугу по названию или выберите категорию"}
      onClose={onClose}
      wide={!chosen}
    >
      {!chosen ? (
        <div className="flex min-h-0 flex-col">
          <div className="space-y-2 border-b p-4" style={{ borderColor: "var(--border)" }}>
            <div className="relative">
              <IconSearch className="pointer-events-none absolute left-3 top-3" size={18} color="var(--text-muted)" />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Например, масло или колодки"
                aria-label="Поиск работы"
                className="w-full rounded-lg border py-2.5 pl-10 pr-3 text-sm outline-none focus:border-[var(--accent)]"
                style={{ borderColor: "var(--border)" }}
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {categories.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setCategory(item)}
                  className="rounded-lg border px-2.5 py-1 text-xs font-medium transition"
                  style={{
                    borderColor: category === item ? "var(--accent)" : "var(--border)",
                    background: category === item ? "var(--accent)" : "white",
                    color: category === item ? "white" : "var(--text)",
                  }}
                >
                  {item === "all" ? "Все категории" : item}
                </button>
              ))}
            </div>
          </div>

          <div className="max-h-[48vh] overflow-y-auto">
            {found.map((service) => (
              <button
                key={service.id}
                type="button"
                onClick={() => pick(service)}
                className="flex w-full items-start justify-between gap-3 border-b px-4 py-3 text-left transition last:border-b-0 hover:bg-gray-50"
                style={{ borderColor: "var(--border)" }}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{service.name}</span>
                  <span className="muted block truncate text-xs">
                    {service.category}
                    {service.normMinutes ? ` · норматив ${formatDuration(service.normMinutes)}` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums">{formatMoney(service.price)}</span>
              </button>
            ))}
            {found.length === 0 && <p className="muted p-4 text-sm">В прайсе такого нет — добавьте работу вручную.</p>}
          </div>

          <div className="border-t p-4" style={{ borderColor: "var(--border)" }}>
            <Button variant="secondary" className="w-full justify-center" onClick={startCustom}>
              Работа не из прайса
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3 p-4">
          {custom && (
            <label className="block text-sm">
              <span className="muted mb-1 block">Название работы</span>
              <div className="field-control">
                <input autoFocus value={name} onChange={(event) => setName(event.target.value)} aria-label="Название работы" placeholder="Например, снятие поддона" />
              </div>
            </label>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="block text-sm">
              <span className="muted mb-1 block">Количество</span>
              <div className="field-control">
                <input inputMode="numeric" aria-label="Количество" value={qty} onChange={(event) => setQty(event.target.value.replace(/\D/g, "").slice(0, 3))} />
              </div>
            </label>
            <label className="block text-sm">
              <span className="muted mb-1 block">Цена за единицу, ₽</span>
              <div className="field-control">
                <input inputMode="numeric" aria-label="Цена работы" value={price} onChange={(event) => setPrice(moneyInput(event.target.value))} />
              </div>
            </label>
            <label className="block text-sm">
              <span className="muted mb-1 block">Норматив, мин</span>
              <div className="field-control">
                <input inputMode="numeric" aria-label="Норматив, минут" value={norm} onChange={(event) => setNorm(event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="60" />
              </div>
            </label>
          </div>

          <label className="block text-sm">
            <span className="muted mb-1 block">Исполнитель</span>
            <div className="field-control">
              <select value={executor} onChange={(event) => setExecutor(event.target.value)} aria-label="Исполнитель">
                <option value="">Пока не назначен</option>
                {mechanicCandidates(employees, orders).map(({ employee, load }) => (
                  <option key={employee.id} value={employee.name}>
                    {employee.name} · {mechanicWorkloadLabel(load)}
                  </option>
                ))}
              </select>
            </div>
            <span className="muted mt-1 block text-xs">
              Показываются механики и владельцы сервиса, которые тоже ремонтируют машины; сначала менее загруженные.
            </span>
          </label>

          <div className="flex items-center justify-between rounded-lg p-3 text-sm" style={{ background: "var(--bg)" }}>
            <span className="muted">Добавится к сумме заказа</span>
            <b className="tabular-nums">{formatMoney(total)}</b>
          </div>

          <div className="flex flex-wrap justify-between gap-2">
            <Button variant="secondary" onClick={() => { setSelected(null); setCustom(false); }}>Выбрать другую</Button>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={onClose}>Отмена</Button>
              <Button
                disabled={!name.trim() || !validQty || !validPrice}
                onClick={() => {
                  if (submittedRef.current) return;
                  submittedRef.current = true;
                  onSubmit({
                    id: workIdRef.current,
                    name: name.trim(),
                    qty: count,
                    price: Number(price) || 0,
                    executor: executor || undefined,
                    normMinutes: Number(norm) || undefined,
                  });
                }}
              >
                Добавить в заказ
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
