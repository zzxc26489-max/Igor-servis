import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

function looksLikeChunkLoadError(error: Error) {
  const message = error.message.toLowerCase();
  return (
    message.includes("failed to fetch dynamically imported module") ||
    message.includes("importing a module script failed") ||
    message.includes("loading chunk") ||
    message.includes("dynamically imported module")
  );
}

export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("CRM render error", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    const chunkError = looksLikeChunkLoadError(this.state.error);
    return (
      <main className="grid min-h-screen place-items-center bg-[var(--bg)] px-4">
        <section className="w-full max-w-md rounded-2xl border bg-white p-5 shadow-sm" style={{ borderColor: "var(--border)" }}>
          <h1 className="text-lg font-bold">
            {chunkError ? "Раздел не удалось загрузить" : "CRM временно не может показать экран"}
          </h1>
          <p className="muted mt-2 text-sm">
            {chunkError
              ? "Возможно, приложение обновилось или сейчас нет сети. Сохранённые на сервере данные не затронуты."
              : "Перезапустите приложение. Если ошибка повторится, зафиксируйте экран и время ошибки."}
          </p>
          <button
            type="button"
            className="mt-4 h-11 w-full rounded-xl bg-[var(--accent)] px-4 font-semibold text-white"
            onClick={() => window.location.reload()}
          >
            Перезапустить CRM
          </button>
        </section>
      </main>
    );
  }
}
