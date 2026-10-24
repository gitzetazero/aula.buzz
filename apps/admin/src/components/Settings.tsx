import { useEffect, useState } from "preact/hooks";
import { api, type SectionSetting } from "../lib/api.ts";

export default function Settings() {
  const [sections, setSections] = useState<SectionSetting[] | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    api<{ sections: SectionSetting[]; announcement: string }>("settings").then(
      (r) => {
        setSections(r.sections);
        setAnnouncement(r.announcement);
      },
      (e: Error) => setMessage({ kind: "error", text: e.message }),
    );
  }, []);

  if (!sections) return message ? <p class="notice notice--error" role="alert">{message.text}</p> : <p class="muted">Cargando…</p>;

  const update = (i: number, patch: Partial<SectionSetting>) => setSections(sections.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i: number, d: number) => {
    const next = [...sections];
    const [item] = next.splice(i, 1);
    next.splice(i + d, 0, item!);
    setSections(next);
  };

  async function save() {
    try {
      await api("settings", { method: "PUT", body: { sections, announcement } });
      setMessage({ kind: "ok", text: "Guardado." });
    } catch (e) {
      setMessage({ kind: "error", text: (e as Error).message });
    }
  }

  return (
    <div class="stack">
      <section class="card stack">
        <h2>Anuncio</h2>
        <p class="muted">Aparece como banda en todas las páginas. Déjalo vacío para ocultarlo.</p>
        <input type="text" maxLength={500} aria-label="Anuncio" value={announcement} onInput={(e) => setAnnouncement(e.currentTarget.value)} />
      </section>

      <section class="card stack">
        <h2>Secciones del portal</h2>
        <table class="table">
          <thead><tr><th>Nombre</th><th>Descripción</th><th>Ruta</th><th>Visible</th><th></th></tr></thead>
          <tbody>
            {sections.map((s, i) => (
              <tr key={s.id}>
                <td><input aria-label="Nombre" value={s.nombre} onInput={(e) => update(i, { nombre: e.currentTarget.value })} /></td>
                <td><input aria-label="Descripción" value={s.descripcion} onInput={(e) => update(i, { descripcion: e.currentTarget.value })} /></td>
                <td>
                  <input
                    aria-label="Ruta"
                    placeholder="(próximamente)"
                    value={s.url ?? ""}
                    onInput={(e) => update(i, { url: e.currentTarget.value || undefined })}
                  />
                </td>
                <td><input type="checkbox" aria-label="Visible" checked={s.visible} onChange={(e) => update(i, { visible: e.currentTarget.checked })} /></td>
                <td class="actions">
                  <button class="btn btn--small" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Subir">↑</button>
                  <button class="btn btn--small" disabled={i === sections.length - 1} onClick={() => move(i, 1)} aria-label="Bajar">↓</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div class="row">
        <button class="btn btn--primary" onClick={save}>Guardar cambios</button>
        {message && <span class={message.kind === "ok" ? "ok" : "ko"} role="status">{message.text}</span>}
      </div>
    </div>
  );
}
