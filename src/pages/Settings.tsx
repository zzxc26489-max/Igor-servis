import { useState, type FormEvent } from "react";
import { IconBuildingStore, IconDatabase } from "@tabler/icons-react";
import { useAppStore } from "../store/AppStore";
import { useToast } from "../components/Toast";
import { Button, Card, Page, TopBar } from "../components/ui";

export default function Settings() {
  const { company, updateCompany, resetToSeed } = useAppStore();
  const { showToast } = useToast();
  const [shortName, setShortName] = useState(company.shortName);
  const [address, setAddress] = useState(company.address);
  const [phone, setPhone] = useState(company.phone);
  const [workHours, setWorkHours] = useState(company.workHours);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    updateCompany({ shortName: shortName.trim(), address: address.trim(), phone: phone.trim(), workHours: workHours.trim() });
    showToast("Данные компании сохранены");
  }

  function handleReset() {
    if (!window.confirm("Сбросить все данные к демонстрационным? Все внесённые заказы, клиенты и изменения будут потеряны.")) {
      return;
    }
    resetToSeed();
    showToast("Данные сброшены к демонстрационным");
  }

  return (
    <>
      <TopBar title="Настройки" subtitle="Данные компании и управление демо-данными" />
      <Page>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Card>
            <div className="mb-4 flex items-center gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#e9f5ed] text-[var(--accent)]">
                <IconBuildingStore size={22} />
              </div>
              <div>
                <h2 className="panel-title">Данные компании</h2>
                <p className="muted text-sm">Отображаются в шапке и на печатных документах</p>
              </div>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="block text-sm">
                <span className="mb-1 block muted">Название</span>
                <div className="field-control">
                  <input value={shortName} onChange={(e) => setShortName(e.target.value)} required />
                </div>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block muted">Адрес</span>
                <div className="field-control">
                  <input value={address} onChange={(e) => setAddress(e.target.value)} required />
                </div>
              </label>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="mb-1 block muted">Телефон</span>
                  <div className="field-control">
                    <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+7 900 000-00-00" />
                  </div>
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block muted">Часы работы</span>
                  <div className="field-control">
                    <input value={workHours} onChange={(e) => setWorkHours(e.target.value)} placeholder="Ежедневно, 10:00–20:00" />
                  </div>
                </label>
              </div>
              <div className="flex justify-end">
                <Button type="submit">Сохранить</Button>
              </div>
            </form>
          </Card>

          <Card>
            <div className="mb-4 flex items-center gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#fbe9e9] text-[var(--danger)]">
                <IconDatabase size={22} />
              </div>
              <div>
                <h2 className="panel-title">Демонстрационные данные</h2>
                <p className="muted text-sm">CRM сейчас хранит данные локально в этом браузере</p>
              </div>
            </div>
            <p className="mb-4 text-sm muted">
              Все заказ-наряды, клиенты, склад и финансы сохраняются только на этом устройстве. При переносе CRM
              на сервер данные станут общими для всех сотрудников.
            </p>
            <Button variant="secondary" onClick={handleReset}>
              Сбросить к демонстрационным данным
            </Button>
          </Card>
        </div>
      </Page>
    </>
  );
}
