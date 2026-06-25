import {
  createContext,
  createSignal,
  onCleanup,
  useContext,
  type Accessor,
  type JSX,
} from "solid-js";

/**
 * App-wide transient toasts. The provider owns the queue + auto-dismiss timers;
 * the presentational `Toaster` (components/ui) renders them, and feature code
 * pushes via `useToast().show(...)`. Kept deliberately small and themed with our
 * own tokens rather than pulling in a toast library.
 */
export type ToastInput = {
  title: string;
  body?: string;
  /** Auto-dismiss after this many ms; 0 keeps it until dismissed. */
  durationMs?: number;
};
export type Toast = ToastInput & { id: number };

type ToastApi = {
  toasts: Accessor<Toast[]>;
  show: (toast: ToastInput) => number;
  dismiss: (id: number) => void;
};

const ToastContext = createContext<ToastApi>();
const DEFAULT_DURATION_MS = 6000;

export function ToastProvider(props: { children: JSX.Element }) {
  const [toasts, setToasts] = createSignal<Toast[]>([]);
  const timers = new Map<number, ReturnType<typeof setTimeout>>();
  let nextId = 1;

  const dismiss = (id: number) => {
    setToasts((list) => list.filter((toast) => toast.id !== id));
    const timer = timers.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.delete(id);
    }
  };

  const show = (input: ToastInput): number => {
    const id = nextId++;
    setToasts((list) => [...list, { ...input, id }]);
    const duration = input.durationMs ?? DEFAULT_DURATION_MS;
    if (duration > 0) {
      timers.set(
        id,
        setTimeout(() => dismiss(id), duration),
      );
    }
    return id;
  };

  onCleanup(() => {
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
  });

  return (
    <ToastContext.Provider value={{ toasts, show, dismiss }}>
      {props.children}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}
