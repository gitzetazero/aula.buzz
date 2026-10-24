import { useEffect, useState } from "preact/hooks";
import { api, ApiError } from "../lib/api.ts";
import Activity from "./Activity.tsx";
import Mirrors from "./Mirrors.tsx";
import Resources from "./Resources.tsx";
import Settings from "./Settings.tsx";
import Users from "./Users.tsx";

const TABS = [
  ["users", "Usuarios", Users],
  ["resources", "Recursos", Resources],
  ["activity", "Actividad", Activity],
  ["mirrors", "Mirrors", Mirrors],
  ["settings", "Secciones y ajustes", Settings],
] as const;

export default function AdminApp() {
  const [tab, setTab] = useState<string>(() => location.hash.slice(1) || "users");
  const [state, setState] = useState<"checking" | "ok" | "denied" | "error">("checking");

  useEffect(() => {
    api("users").then(
      () => setState("ok"),
      (e: unknown) => setState(e instanceof ApiError && e.status === 403 ? "denied" : "error"),
    );
  }, []);

  if (state === "checking") return <p class="muted">Comprobando permisos…</p>;
  if (state === "denied") return <p class="notice notice--error" role="alert">Esta sección es solo para administradores.</p>;
  if (state === "error") return <p class="notice notice--error" role="alert">No se pudo cargar el panel. Recarga la página.</p>;

  const Current = (TABS.find(([id]) => id === tab) ?? TABS[0])[2];
  return (
    <>
      <div class="tabs" role="tablist">
        {TABS.map(([id, label]) => (
          <button
            role="tab"
            aria-selected={id === tab}
            onClick={() => {
              setTab(id);
              history.replaceState(null, "", `#${id}`);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <Current />
    </>
  );
}
