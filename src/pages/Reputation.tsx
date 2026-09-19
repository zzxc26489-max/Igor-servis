import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  IconAlertTriangle,
  IconBell,
  IconBrandWhatsapp,
  IconCheck,
  IconMessage,
  IconPhone,
  IconPlus,
  IconRefresh,
  IconStar,
} from "@tabler/icons-react";
import { Button, Card, EmptyState, Metric, Modal, Page, TopBar } from "../components/ui";
import { useAppStore } from "../store/AppStore";
import { useToast } from "../components/Toast";
import { createId } from "../lib/id";
import { todayISO } from "../lib/date";
import { formatDate } from "../lib/format";
import type { Client, ClientCommunicationType, ClientReview, ReviewCaseStatus, ReviewPlatform } from "../types";

const PLATFORM_LABELS: Record<ReviewPlatform, string> = {
  yandex: "Яндекс Карты",
  "2gis": "2ГИС",
  google: "Google",
  other: "Другое",
};

const STATUS_LABELS: Record<ReviewCaseStatus, string> = {
  new: "Новый",
  contacted: "Связались",
  resolving: "Решаем",
  resolved: "Решено",
  updated: "Отзыв обновлён",
};

function telHref(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

function whatsappHref(phone: string, text: string) {
  const digits = phone.replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

function smsHref(phone: string, text: string) {
  return `sms:${phone.replace(/[^\d+]/g, "")}?body=${encodeURIComponent(text)}`;
}

export default function Reputation() {
  const { clients, orders, vehicles, updateClient, cloud } = useAppStore();
  const { showToast } = useToast();
  const [reviewClientId, setReviewClientId] = useState<string | null>(null);
  const [rating, setRating] = useState("5");
  const [platform, setPlatform] = useState<ReviewPlatform>("yandex");
  const [reviewText, setReviewText] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");

  const reviews = useMemo(
    () => clients.flatMap((client) => (client.reviews ?? []).map((review) => ({ client, review })))
      .sort((a, b) => b.review.createdAt.localeCompare(a.review.createdAt)),
    [clients],
  );

  const negative = reviews.filter(({ review }) => review.rating <= 3 && !["resolved", "updated"].includes(review.status));
  const month = todayISO().slice(0, 7);
  const monthReviews = reviews.filter(({ review }) => review.createdAt.slice(0, 7) === month);
  const average = monthReviews.length
    ? monthReviews.reduce((sum, item) => sum + item.review.rating, 0) / monthReviews.length
    : 0;

  const reviewRequests = useMemo(() => {
    const issued = orders
      .filter((order) => order.status === "выдан")
      .sort((a, b) => (b.issuedAt ?? b.createdAt).localeCompare(a.issuedAt ?? a.createdAt));
    return issued.filter((order) => {
      const client = clients.find((item) => item.id === order.clientId);
      if (!client) return false;
      const alreadyRequested = (client.communications ?? []).some(
        (entry) => entry.type === "review_request" && entry.orderId === order.id,
      );
      const alreadyReviewed = (client.reviews ?? []).some((entry) => entry.orderId === order.id);
      return !alreadyRequested && !alreadyReviewed;
    }).slice(0, 12);
  }, [clients, orders]);

  const deferred = useMemo(
    () => orders.flatMap((order) =>
      (order.deferredRecommendations ?? [])
        .filter((item) => item.status === "open")
        .map((item) => ({
          order,
          item,
          client: clients.find((client) => client.id === order.clientId),
          vehicle: vehicles.find((vehicle) => vehicle.id === order.vehicleId),
        })),
    ).sort((a, b) => (a.item.dueDate ?? "9999").localeCompare(b.item.dueDate ?? "9999")),
    [clients, orders, vehicles],
  );

  const serviceDue = useMemo(() => vehicles
    .filter((vehicle) => vehicle.nextServiceDate && vehicle.nextServiceDate <= todayISO())
    .map((vehicle) => ({
      vehicle,
      client: clients.find((client) => client.id === vehicle.clientId),
    }))
    .filter((item) => item.client), [clients, vehicles]);

  async function patchClient(client: Client, patch: Partial<Client>, message: string) {
    const error = await updateClient(client.id, patch);
    if (error) {
      showToast(error, "error");
      return false;
    }
    showToast(message);
    return true;
  }

  async function logCommunication(
    client: Client,
    type: ClientCommunicationType,
    summary: string,
    orderId?: string,
    vehicleId?: string,
  ) {
    const next = [
      ...(client.communications ?? []),
      {
        id: createId("com"),
        at: new Date().toISOString(),
        type,
        summary,
        direction: "out" as const,
        orderId,
        vehicleId,
        actor: cloud.displayName,
      },
    ];
    await patchClient(client, { communications: next }, "Действие отмечено");
  }

  async function submitReview() {
    const client = clients.find((item) => item.id === reviewClientId);
    const numeric = Number(rating);
    if (!client || !Number.isInteger(numeric) || numeric < 1 || numeric > 5 || !reviewText.trim()) {
      showToast("Укажите клиента, оценку и текст отзыва", "error");
      return;
    }
    const review: ClientReview = {
      id: createId("review"),
      platform,
      rating: numeric,
      text: reviewText.trim(),
      createdAt: new Date().toISOString(),
      sourceUrl: sourceUrl.trim() || undefined,
      status: numeric <= 3 ? "new" : "resolved",
    };
    const ok = await patchClient(client, { reviews: [...(client.reviews ?? []), review] }, "Отзыв добавлен");
    if (!ok) return;
    setReviewClientId(null);
    setRating("5");
    setReviewText("");
    setSourceUrl("");
  }

  async function setReviewStatus(client: Client, review: ClientReview, status: ReviewCaseStatus) {
    const reviewsNext = (client.reviews ?? []).map((item) =>
      item.id === review.id ? { ...item, status, updatedAt: new Date().toISOString() } : item,
    );
    await patchClient(client, { reviews: reviewsNext }, "Статус отзыва обновлён");
  }

  return (
    <>
      <TopBar
        title="Репутация и возврат"
        subtitle="Отзывы, просьбы оставить отзыв, отложенные работы и сервисные напоминания"
        actions={<Button onClick={() => setReviewClientId(clients[0]?.id ?? null)}><IconPlus size={17} /> Добавить отзыв</Button>}
      />
      <Page>
        <div className="mb-3 grid grid-cols-2 gap-2 lg:grid-cols-4 lg:gap-3">
          <Metric icon={<IconStar size={18} />} label="Отзывов за месяц" value={String(monthReviews.length)} />
          <Metric icon={<IconStar size={18} />} tone="blue" label="Средняя оценка" value={average ? average.toFixed(1) : "—"} />
          <Metric icon={<IconAlertTriangle size={18} />} tone="danger" label="Требуют реакции" value={String(negative.length)} />
          <Metric icon={<IconBell size={18} />} tone="warning" label="Follow-up задач" value={String(reviewRequests.length + deferred.length + serviceDue.length)} />
        </div>

        <div className="grid gap-3 xl:grid-cols-2">
          <Card>
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <h2 className="panel-title">Отзывы требуют реакции</h2>
                <p className="muted mt-0.5 text-xs">Сначала решить вопрос клиента, затем предложить обновить отзыв.</p>
              </div>
              <IconRefresh size={18} className="muted" />
            </div>
            <div className="space-y-2">
              {negative.map(({ client, review }) => (
                <div key={review.id} className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link to={`/clients/${client.id}`} className="font-semibold hover:text-[var(--accent)]">{client.name}</Link>
                      <div className="muted text-xs">{PLATFORM_LABELS[review.platform]} · {formatDate(review.createdAt)} · {"★".repeat(review.rating)}</div>
                    </div>
                    <span className="rounded-full bg-[#fbe9e9] px-2 py-1 text-[11px] font-semibold text-[var(--danger)]">{STATUS_LABELS[review.status]}</span>
                  </div>
                  <p className="mt-2 text-sm">{review.text}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <a href={telHref(client.phone)}><Button size="sm" variant="secondary"><IconPhone size={16} /> Позвонить</Button></a>
                    {review.status === "new" && <Button size="sm" onClick={() => setReviewStatus(client, review, "contacted")}>Связались</Button>}
                    {review.status === "contacted" && <Button size="sm" onClick={() => setReviewStatus(client, review, "resolving")}>В работе</Button>}
                    {review.status === "resolving" && <Button size="sm" onClick={() => setReviewStatus(client, review, "resolved")}>Решено</Button>}
                    {review.status === "resolved" && <Button size="sm" onClick={() => setReviewStatus(client, review, "updated")}>Отзыв обновлён</Button>}
                    {review.sourceUrl && <a href={review.sourceUrl} target="_blank" rel="noreferrer"><Button size="sm" variant="secondary">Открыть отзыв</Button></a>}
                  </div>
                </div>
              ))}
              {negative.length === 0 && <EmptyState icon={<IconCheck size={20} />} title="Негативных кейсов нет" hint="Все отзывы отработаны" />}
            </div>
          </Card>

          <Card>
            <h2 className="panel-title">Попросить оставить отзыв</h2>
            <p className="muted mt-0.5 text-xs">Только реальные клиенты после завершённого ремонта.</p>
            <div className="mt-3 space-y-2">
              {reviewRequests.map((order) => {
                const client = clients.find((item) => item.id === order.clientId)!;
                const vehicle = vehicles.find((item) => item.id === order.vehicleId);
                const message = `${client.name}, спасибо, что выбрали наш сервис. Если вам всё понравилось, будем благодарны за честный отзыв о работе сервиса.`;
                return (
                  <div key={order.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                    <div>
                      <Link to={`/clients/${client.id}`} className="font-semibold hover:text-[var(--accent)]">{client.name}</Link>
                      <div className="muted text-xs">{vehicle ? `${vehicle.make} ${vehicle.model}` : order.number} · {order.number}</div>
                    </div>
                    <div className="flex gap-1.5">
                      <a href={whatsappHref(client.phone, message)} target="_blank" rel="noreferrer" onClick={() => void logCommunication(client, "review_request", "Просьба оставить отзыв отправлена в WhatsApp", order.id, order.vehicleId)}>
                        <Button size="icon" variant="secondary" aria-label="WhatsApp"><IconBrandWhatsapp size={18} /></Button>
                      </a>
                      <a href={smsHref(client.phone, message)} onClick={() => void logCommunication(client, "review_request", "Просьба оставить отзыв отправлена по SMS", order.id, order.vehicleId)}>
                        <Button size="icon" variant="secondary" aria-label="SMS"><IconMessage size={18} /></Button>
                      </a>
                    </div>
                  </div>
                );
              })}
              {reviewRequests.length === 0 && <EmptyState icon={<IconStar size={20} />} title="Все просьбы обработаны" />}
            </div>
          </Card>

          <Card>
            <h2 className="panel-title">Отложенные рекомендации</h2>
            <div className="mt-3 space-y-2">
              {deferred.slice(0, 12).map(({ order, item, client, vehicle }) => (
                <div key={item.id} className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <Link to={`/orders/${order.id}`} className="font-semibold hover:text-[var(--accent)]">{item.title}</Link>
                      <div className="muted text-xs">{client?.name ?? "Клиент"}{vehicle ? ` · ${vehicle.make} ${vehicle.model}` : ""}</div>
                    </div>
                    {item.dueDate && <span className="muted text-xs">{formatDate(item.dueDate)}</span>}
                  </div>
                  {item.note && <p className="mt-1 text-sm">{item.note}</p>}
                </div>
              ))}
              {deferred.length === 0 && <EmptyState icon={<IconCheck size={20} />} title="Отложенных рекомендаций нет" />}
            </div>
          </Card>

          <Card>
            <h2 className="panel-title">Сервисные напоминания</h2>
            <div className="mt-3 space-y-2">
              {serviceDue.map(({ vehicle, client }) => {
                const message = `${client!.name}, напоминаем: для ${vehicle.make} ${vehicle.model} подошёл срок планового обслуживания. Можем подобрать удобное время для записи.`;
                return (
                  <div key={vehicle.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                    <div>
                      <Link to={`/clients/${client!.id}`} className="font-semibold hover:text-[var(--accent)]">{vehicle.make} {vehicle.model}</Link>
                      <div className="muted text-xs">{client!.name} · срок {formatDate(vehicle.nextServiceDate!)}</div>
                    </div>
                    <a href={whatsappHref(client!.phone, message)} target="_blank" rel="noreferrer" onClick={() => void logCommunication(client!, "service_reminder", "Отправлено сервисное напоминание", undefined, vehicle.id)}>
                      <Button size="sm" variant="secondary"><IconBrandWhatsapp size={16} /> Напомнить</Button>
                    </a>
                  </div>
                );
              })}
              {serviceDue.length === 0 && <EmptyState icon={<IconCheck size={20} />} title="Просроченных сервисных напоминаний нет" />}
            </div>
          </Card>
        </div>
      </Page>

      {reviewClientId && (
        <Modal title="Добавить отзыв" subtitle="Ручной ввод из Яндекс Карт, 2ГИС или другой площадки" onClose={() => setReviewClientId(null)}>
          <div className="space-y-3 p-4">
            <label className="block text-sm">
              <span className="muted mb-1 block">Клиент</span>
              <div className="field-control">
                <select value={reviewClientId} onChange={(e) => setReviewClientId(e.target.value)}>
                  {clients.map((client) => <option key={client.id} value={client.id}>{client.name} · {client.phone}</option>)}
                </select>
              </div>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-sm">
                <span className="muted mb-1 block">Площадка</span>
                <div className="field-control">
                  <select value={platform} onChange={(e) => setPlatform(e.target.value as ReviewPlatform)}>
                    {Object.entries(PLATFORM_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </div>
              </label>
              <label className="block text-sm">
                <span className="muted mb-1 block">Оценка</span>
                <div className="field-control">
                  <select value={rating} onChange={(e) => setRating(e.target.value)}>
                    {[5,4,3,2,1].map((value) => <option key={value} value={value}>{value} ★</option>)}
                  </select>
                </div>
              </label>
            </div>
            <label className="block text-sm">
              <span className="muted mb-1 block">Текст отзыва</span>
              <div className="field-control"><textarea rows={4} value={reviewText} onChange={(e) => setReviewText(e.target.value)} /></div>
            </label>
            <label className="block text-sm">
              <span className="muted mb-1 block">Ссылка на отзыв</span>
              <div className="field-control"><input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://..." /></div>
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setReviewClientId(null)}>Отмена</Button>
              <Button onClick={() => void submitReview()}>Сохранить</Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
