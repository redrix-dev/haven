import {
  createContext,
  createSignal,
  onMount,
  useContext,
  type Accessor,
  type JSX,
} from "solid-js";
import { useBridge, type StagedUpdate } from "./BridgeProvider";

/**
 * Owns the desktop auto-update lifecycle for the main window.
 *
 * On mount it asks the shell (via the bridge) for the current version and
 * checks/stages an update in the background. The titlebar reads this state to
 * surface a dismissible "update ready" pill; a `critical` update is forced via
 * a blocking overlay. Mounted only on the main-window branch (routes/index.tsx),
 * so popout windows never run their own check. On web the bridge exposes no
 * updater, so everything stays inert.
 */
type UpdaterState = {
  version: Accessor<string>;
  update: Accessor<StagedUpdate | null>;
  dismissed: Accessor<boolean>;
  applying: Accessor<boolean>;
  dismiss: () => void;
  apply: () => Promise<void>;
};

const UpdaterContext = createContext<UpdaterState>();

export function UpdaterProvider(props: { children: JSX.Element }) {
  const bridge = useBridge();
  const [version, setVersion] = createSignal("");
  const [update, setUpdate] = createSignal<StagedUpdate | null>(null);
  const [dismissed, setDismissed] = createSignal(false);
  const [applying, setApplying] = createSignal(false);

  onMount(() => {
    const updater = bridge.updater;
    if (!updater) return;
    void (async () => {
      try {
        setVersion(await updater.currentVersion());
        const staged = await updater.checkAndStage();
        if (staged) setUpdate(staged);
      } catch (err) {
        // A missing release / offline machine must never break startup.
        console.warn("[updater] check failed:", err);
      }
    })();
  });

  const apply = async () => {
    const updater = bridge.updater;
    if (!updater || applying()) return;
    setApplying(true);
    try {
      await updater.applyAndRestart();
    } catch (err) {
      console.warn("[updater] apply failed:", err);
      setApplying(false);
    }
  };

  const state: UpdaterState = {
    version,
    update,
    dismissed,
    applying,
    dismiss: () => setDismissed(true),
    apply,
  };

  return (
    <UpdaterContext.Provider value={state}>
      {props.children}
    </UpdaterContext.Provider>
  );
}

export function useUpdater(): UpdaterState {
  const ctx = useContext(UpdaterContext);
  if (!ctx) {
    throw new Error("useUpdater must be used within an UpdaterProvider");
  }
  return ctx;
}
