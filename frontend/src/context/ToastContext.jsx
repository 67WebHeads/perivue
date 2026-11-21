import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const ToastContext = createContext(null);
const DEFAULT_DURATION = 4500;
const MAX_TOASTS = 4;

const TOAST_STYLES = {
  success: {
    title: "Success",
    accent: "text-emerald-300",
    border: "border-emerald-400/30",
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="m5 12 4 4L19 6" />
    ),
  },
  error: {
    title: "Something went wrong",
    accent: "text-rose-300",
    border: "border-rose-400/30",
    icon: (
      <>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 17h.01" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.3 3.8 2.7 17a2 2 0 0 0 1.7 3h15.2a2 2 0 0 0 1.7-3L13.7 3.8a2 2 0 0 0-3.4 0Z" />
      </>
    ),
  },
  warning: {
    title: "Please note",
    accent: "text-amber-300",
    border: "border-amber-400/30",
    icon: (
      <>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v5" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 17h.01" />
        <circle cx="12" cy="12" r="9" />
      </>
    ),
  },
  info: {
    title: "Information",
    accent: "text-lavender",
    border: "border-lavender/30",
    icon: (
      <>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 11v6" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 7h.01" />
        <circle cx="12" cy="12" r="9" />
      </>
    ),
  },
};

function ToastIcon({ type }) {
  const style = TOAST_STYLES[type];
  return (
    <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/5 ${style.accent}`}>
      <svg
        aria-hidden="true"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        viewBox="0 0 24 24"
      >
        {style.icon}
      </svg>
    </span>
  );
}

function ToastViewport({ toasts, dismiss }) {
  return (
    <div
      aria-atomic="false"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 top-4 z-[100] flex flex-col items-end gap-3 sm:inset-x-auto sm:right-5 sm:top-5 sm:w-[24rem]"
    >
      {toasts.map((toast) => {
        const style = TOAST_STYLES[toast.type];
        return (
          <div
            key={toast.id}
            role={toast.type === "error" ? "alert" : "status"}
            className={`toast-enter pointer-events-auto flex w-full gap-3 rounded-2xl border bg-dark/95 p-4 text-white shadow-2xl shadow-black/40 backdrop-blur-xl ${style.border}`}
          >
            <ToastIcon type={toast.type} />
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-semibold ${style.accent}`}>
                {toast.title || style.title}
              </p>
              <p className="mt-0.5 text-sm leading-relaxed text-white/70">
                {toast.message}
              </p>
            </div>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/30 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Dismiss notification"
            >
              <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                <path strokeLinecap="round" d="m7 7 10 10M17 7 7 17" />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());
  const nextId = useRef(0);

  const dismiss = useCallback((id) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback((message, options = {}) => {
    const config = typeof message === "string" ? { ...options, message } : message;
    const id = ++nextId.current;
    const type = TOAST_STYLES[config.type] ? config.type : "info";
    const duration = config.duration ?? DEFAULT_DURATION;

    setToasts((current) => [
      ...current.slice(-(MAX_TOASTS - 1)),
      { id, type, title: config.title, message: config.message },
    ]);

    if (duration > 0) {
      const timer = setTimeout(() => dismiss(id), duration);
      timers.current.set(id, timer);
    }

    return id;
  }, [dismiss]);

  useEffect(() => () => {
    timers.current.forEach(clearTimeout);
    timers.current.clear();
  }, []);

  const value = useMemo(() => ({
    show,
    dismiss,
    success: (message, options) => show(message, { ...options, type: "success" }),
    error: (message, options) => show(message, { ...options, type: "error" }),
    warning: (message, options) => show(message, { ...options, type: "warning" }),
    info: (message, options) => show(message, { ...options, type: "info" }),
  }), [dismiss, show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} dismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside <ToastProvider>");
  return context;
}
