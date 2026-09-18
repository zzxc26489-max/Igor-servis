import { useState, type FormEvent } from "react";
import { IconLock, IconMail } from "@tabler/icons-react";
import { useAuth } from "../auth/AuthContext";
import logo from "../assets/logo.jpg";

export default function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await signIn(email, password);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось войти");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[var(--bg)] px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border bg-white p-5 shadow-sm" style={{ borderColor: "var(--border)" }}>
        <div className="mb-5 flex items-center gap-3">
          <img src={logo} alt="" className="h-12 w-12 rounded-xl object-cover" />
          <div>
            <h1 className="text-xl font-bold">The Service CRM</h1>
            <p className="muted text-sm">Вход в общую базу сервиса</p>
          </div>
        </div>

        <label className="mb-3 block text-sm">
          <span className="muted mb-1 block">Email</span>
          <div className="field-control flex items-center gap-2">
            <IconMail size={18} className="muted shrink-0" />
            <input
              autoComplete="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="igor@example.ru"
              required
            />
          </div>
        </label>

        <label className="block text-sm">
          <span className="muted mb-1 block">Пароль</span>
          <div className="field-control flex items-center gap-2">
            <IconLock size={18} className="muted shrink-0" />
            <input
              autoComplete="current-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              required
            />
          </div>
        </label>

        {error && <div className="mt-3 rounded-lg bg-[#fff1f1] px-3 py-2 text-sm text-[var(--danger)]">{error}</div>}

        <button
          type="submit"
          disabled={busy}
          className="mt-4 h-11 w-full rounded-xl bg-[var(--accent)] px-4 font-semibold text-white disabled:opacity-60"
        >
          {busy ? "Входим…" : "Войти"}
        </button>
        <p className="muted mt-4 text-xs">
          Доступ выдаёт владелец сервиса. Данные синхронизируются между телефоном и компьютером.
        </p>
      </form>
    </main>
  );
}
