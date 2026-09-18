import { useMemo, useState, type FormEvent } from "react";
import { IconEdit, IconPlus, IconSearch, IconTool, IconTrash } from "@tabler/icons-react";
import { useAppStore } from "../store/AppStore";
import { createId } from "../lib/id";
import { useToast } from "../components/Toast";
import { useConfirm } from "../components/Confirm";
import { Button, Card, Page, TopBar } from "../components/ui";
import { formatMoney, plural } from "../lib/format";

export default function Services() {
  const { services, addService, updateService, deleteService } = useAppStore();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [price, setPrice] = useState("");

  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("ru-RU");
    if (!term) return services;
    return services.filter((service) => `${service.name} ${service.category}`.toLocaleLowerCase("ru-RU").includes(term));
  }, [query, services]);
  const categories = Array.from(new Set(filtered.map((service) => service.category)));

  function resetForm() {
    setShowForm(false);
    setEditingId(null);
    setName("");
    setCategory("");
    setPrice("");
  }

  function startEdit(id: string) {
    const service = services.find((item) => item.id === id);
    if (!service) return;
    setEditingId(id);
    setName(service.name);
    setCategory(service.category);
    setPrice(String(service.price));
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanName = name.trim();
    const cleanCategory = category.trim();
    const numericPrice = Number(price);
    if (!cleanName || !cleanCategory || numericPrice <= 0) {
      showToast("Заполните название, категорию и цену", "error");
      return;
    }
    if (editingId) {
      updateService(editingId, { name: cleanName, category: cleanCategory, price: numericPrice });
      showToast("Услуга обновлена");
    } else {
      addService({ id: createId("sv"), name: cleanName, category: cleanCategory, price: numericPrice });
      showToast("Услуга добавлена");
    }
    resetForm();
  }

  async function handleDelete(id: string, serviceName: string) {
    const service = services.find((item) => item.id === id);
    const ok = await confirm({
      title: "Удалить услугу",
      question: "Услуга пропадёт из прайс-листа. Уже добавленные в заказы работы останутся на месте.",
      summary: [
        { label: "Услуга", value: serviceName },
        { label: "Категория", value: service?.category ?? "—" },
        { label: "Цена", value: formatMoney(service?.price ?? 0) },
      ],
      confirmLabel: "Удалить",
      danger: true,
    });
    if (!ok) return;
    deleteService(id);
    if (editingId === id) resetForm();
    showToast("Услуга удалена", "error");
  }

  return (
    <>
      <TopBar
        title="Услуги"
        subtitle={`${services.length} ${plural(services.length, "позиция", "позиции", "позиций")} в прайс-листе`}
        actions={<Button onClick={() => { resetForm(); setShowForm(true); }}><span className="inline-flex items-center gap-2"><IconPlus size={18} /> Добавить услугу</span></Button>}
      />
      <Page>
        <div className="relative mb-4 max-w-xl">
          <IconSearch className="pointer-events-none absolute left-3 top-2.5" size={18} color="var(--text-muted)" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} className="w-full rounded-lg border bg-white py-2 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]" style={{ borderColor: "var(--border)" }} placeholder="Поиск по названию или категории" />
        </div>

        {showForm && (
          <Card className="mb-4">
            <h2 className="panel-title mb-4">{editingId ? "Изменить услугу" : "Новая услуга"}</h2>
            <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_1fr_180px_auto] lg:items-end">
              <label className="text-sm"><span className="mb-1 block muted">Название</span><div className="field-control"><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Например, замена ступичного подшипника" autoFocus required /></div></label>
              <label className="text-sm"><span className="mb-1 block muted">Категория</span><div className="field-control"><input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="Ходовая часть" list="service-categories" required /></div></label>
              <datalist id="service-categories">{Array.from(new Set(services.map((service) => service.category))).map((item) => <option value={item} key={item} />)}</datalist>
              <label className="text-sm"><span className="mb-1 block muted">Цена, ₽</span><div className="field-control"><input value={price} onChange={(event) => setPrice(event.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="2500" required /></div></label>
              <div className="flex gap-2"><Button type="submit">{editingId ? "Сохранить" : "Добавить"}</Button><Button variant="secondary" onClick={resetForm}>Отмена</Button></div>
            </form>
          </Card>
        )}

        {categories.length === 0 ? (
          <Card><p className="muted text-sm">Услуги не найдены.</p></Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {categories.map((currentCategory) => {
              const categoryServices = filtered.filter((service) => service.category === currentCategory);
              return (
              <Card key={currentCategory} className="p-0 overflow-hidden">
                <div className="flex items-center gap-3 border-b p-4" style={{ borderColor: "var(--border)" }}>
                  <div className="grid h-9 w-9 place-items-center rounded-lg bg-[#e9f5ed] text-[var(--accent)]"><IconTool size={18} /></div>
                  <div><h2 className="panel-title">{currentCategory}</h2><p className="muted text-xs">{categoryServices.length} {plural(categoryServices.length, "услуга", "услуги", "услуг")}</p></div>
                </div>
                <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
                  {categoryServices.map((service) => (
                    <li key={service.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                      <span className="min-w-0 flex-1">{service.name}</span>
                      <span className="shrink-0 font-semibold">{formatMoney(service.price)}</span>
                      <button onClick={() => startEdit(service.id)} className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-[var(--accent)] hover:bg-[#e9f5ed] sm:h-9 sm:w-9" aria-label={`Изменить услугу «${service.name}»`}><IconEdit size={17} /></button>
                      <button onClick={() => handleDelete(service.id, service.name)} className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-[var(--danger)] hover:bg-[#fbe9e9] sm:h-9 sm:w-9" aria-label={`Удалить услугу «${service.name}»`}><IconTrash size={17} /></button>
                    </li>
                  ))}
                </ul>
              </Card>
              );
            })}
          </div>
        )}
      </Page>
    </>
  );
}
