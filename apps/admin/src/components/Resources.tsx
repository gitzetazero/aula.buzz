import { useEffect, useRef, useState } from "preact/hooks";
import { api, formatBytes, type Resource } from "../lib/api.ts";
import { uploadResource } from "../lib/upload.ts";

const TIPOS = [
  ["vm", "Máquina virtual"],
  ["iso", "ISO"],
  ["archivo", "Archivo"],
  ["comprimido", "Comprimido"],
] as const;

const slug = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

interface Draft {
  id: string;
  nombre: string;
  descripcion: string;
  asignatura: string;
  tipo: Resource["tipo"];
  so: string;
  tags: string;
  hipervisor: string;
  ram: string;
  disco: string;
  cpus: string;
  credenciales: string;
  instrucciones: string;
}

const EMPTY: Draft = { id: "", nombre: "", descripcion: "", asignatura: "", tipo: "vm", so: "", tags: "", hipervisor: "", ram: "", disco: "", cpus: "", credenciales: "", instrucciones: "" };

function toDraft(r: Resource): Draft {
  return {
    id: r.id,
    nombre: r.nombre,
    descripcion: r.descripcion,
    asignatura: r.asignatura,
    tipo: r.tipo,
    so: r.so ?? "",
    tags: r.tags.join(", "),
    hipervisor: r.hipervisor ?? "",
    ram: r.requisitos?.ram_gb?.toString() ?? "",
    disco: r.requisitos?.disco_gb?.toString() ?? "",
    cpus: r.requisitos?.cpus?.toString() ?? "",
    credenciales: r.credenciales.map((c) => [c.usuario, c.password, c.nota].filter((x) => x !== undefined).join(":")).join("\n"),
    instrucciones: r.instrucciones ?? "",
  };
}

function toResource(d: Draft, files: Pick<Resource, "archivo" | "partes">): Resource {
  const num = (v: string) => (v.trim() ? Number(v) : undefined);
  const requisitos = Object.fromEntries(
    Object.entries({ ram_gb: num(d.ram), disco_gb: num(d.disco), cpus: num(d.cpus) }).filter(([, v]) => v !== undefined),
  );
  return {
    id: d.id,
    nombre: d.nombre,
    descripcion: d.descripcion,
    asignatura: d.asignatura,
    tipo: d.tipo,
    ...(d.so && { so: d.so }),
    tags: d.tags.split(",").map((t) => t.trim()).filter(Boolean),
    actualizado: new Date().toISOString().slice(0, 10),
    ...(d.hipervisor && { hipervisor: d.hipervisor }),
    ...(Object.keys(requisitos).length > 0 && { requisitos }),
    credenciales: d.credenciales
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [usuario = "", password = "", ...nota] = l.split(":");
        return { usuario, password, ...(nota.length > 0 && { nota: nota.join(":") }) };
      }),
    ...(d.instrucciones && { instrucciones: d.instrucciones }),
    ...files,
  };
}

export default function Resources() {
  const [items, setItems] = useState<Resource[] | null>(null);
  const [editing, setEditing] = useState<Resource | "new" | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const load = () => api<{ recursos: Resource[] }>("resources").then((r) => setItems(r.recursos));
  useEffect(() => {
    load().catch((e: Error) => setMessage({ kind: "error", text: e.message }));
  }, []);

  async function remove(r: Resource, mirrors: boolean) {
    const ask = mirrors
      ? `¿Borrar «${r.nombre}» del catálogo Y de los mirrors (GitHub y Drive)? No se puede deshacer.`
      : `¿Quitar «${r.nombre}» del catálogo? Los archivos de los mirrors se conservan.`;
    if (!confirm(ask)) return;
    try {
      const res = await api<{ mirrors: Record<string, string> }>(`resources/${encodeURIComponent(r.id)}${mirrors ? "?mirrors=1" : ""}`, { method: "DELETE" });
      const extra = mirrors ? ` GitHub: ${res.mirrors.github}. Drive: ${res.mirrors.drive}.` : "";
      setMessage({ kind: "ok", text: `«${r.nombre}» eliminado.${extra}` });
      await load();
    } catch (e) {
      setMessage({ kind: "error", text: (e as Error).message });
    }
  }

  if (editing) {
    return (
      <Editor
        initial={editing === "new" ? null : editing}
        onDone={async (text) => {
          setEditing(null);
          setMessage({ kind: "ok", text });
          await load();
        }}
        onCancel={() => setEditing(null)}
      />
    );
  }

  return (
    <div class="stack">
      <div class="actions"><button class="btn btn--primary" onClick={() => setEditing("new")}>Subir recurso nuevo</button></div>
      {message && <p class={`notice ${message.kind === "error" ? "notice--error" : ""}`} role="status">{message.text}</p>}
      {!items ? (
        <p class="muted">Cargando…</p>
      ) : items.length === 0 ? (
        <p class="muted">Todavía no hay recursos.</p>
      ) : (
        <table class="table">
          <thead><tr><th>Recurso</th><th>Asignatura</th><th>Tamaño</th><th>Mirrors</th><th></th></tr></thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.id}>
                <td><strong>{r.nombre}</strong><div class="muted">{r.id}</div></td>
                <td>{r.asignatura}</td>
                <td>{formatBytes(r.archivo.tamano)} · {r.partes.length} parte(s)</td>
                <td>
                  {r.partes.every((p) => p.drive_id) && <span class="badge">Drive</span>} {r.partes.every((p) => p.github_asset_id) && <span class="badge">GitHub</span>}
                </td>
                <td class="actions">
                  <button class="btn btn--small" onClick={() => setEditing(r)}>Editar</button>
                  <button class="btn btn--small btn--ghost" onClick={() => remove(r, false)}>Quitar</button>
                  <button class="btn btn--small btn--ghost" onClick={() => remove(r, true)}>Borrar todo</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Editor({ initial, onDone, onCancel }: { initial: Resource | null; onDone: (text: string) => void; onCancel: () => void }) {
  const [d, setD] = useState<Draft>(initial ? toDraft(initial) : EMPTY);
  const [file, setFile] = useState<File | null>(null);
  const [github, setGithub] = useState(true);
  const [drive, setDrive] = useState(true);
  const [status, setStatus] = useState<{ text: string; fraction: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((prev) => ({ ...prev, [k]: v }));

  async function submit(e: Event) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      let files: Pick<Resource, "archivo" | "partes">;
      if (file) {
        abort.current = new AbortController();
        files = await uploadResource({
          file,
          id: d.id,
          nombre: d.nombre,
          github,
          drive,
          onStatus: (text, fraction) => setStatus({ text, fraction }),
          signal: abort.current.signal,
        });
      } else if (initial) {
        files = { archivo: initial.archivo, partes: initial.partes };
      } else {
        throw new Error("Elige el archivo que quieres subir");
      }
      await api(`resources/${encodeURIComponent(d.id)}`, { method: "PUT", body: toResource(d, files) });
      onDone(`«${d.nombre}» guardado.`);
    } catch (err) {
      setError((err as Error).name === "AbortError" ? "Subida cancelada." : (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const field = (label: string, k: keyof Draft, props: Record<string, unknown> = {}) => (
    <label>
      {label}
      <input value={d[k]} onInput={(e) => set(k, e.currentTarget.value as never)} {...props} />
    </label>
  );

  return (
    <form class="stack" onSubmit={submit}>
      <h2>{initial ? `Editar «${initial.nombre}»` : "Nuevo recurso"}</h2>
      <div class="form">
        <label>
          Nombre
          <input
            required
            value={d.nombre}
            onInput={(e) => {
              const nombre = e.currentTarget.value;
              setD((p) => ({ ...p, nombre, id: initial ? p.id : slug(nombre) }));
            }}
          />
        </label>
        {field("Identificador", "id", { required: true, pattern: "[a-z0-9]+(-[a-z0-9]+)*", readOnly: Boolean(initial) })}
        {field("Asignatura", "asignatura", { required: true })}
        <label>
          Tipo
          <select value={d.tipo} onChange={(e) => set("tipo", e.currentTarget.value as Resource["tipo"])}>
            {TIPOS.map(([v, l]) => <option value={v}>{l}</option>)}
          </select>
        </label>
        <label class="wide">
          Descripción
          <input required value={d.descripcion} onInput={(e) => set("descripcion", e.currentTarget.value)} />
        </label>
        {field("Sistema operativo", "so")}
        {field("Hipervisor", "hipervisor")}
        {field("Etiquetas (separadas por comas)", "tags")}
        {field("RAM (GB)", "ram", { type: "number", min: 0, step: "any" })}
        {field("Disco (GB)", "disco", { type: "number", min: 0, step: "any" })}
        {field("CPUs", "cpus", { type: "number", min: 0, step: 1 })}
        <label class="wide">
          Credenciales por defecto (una por línea: usuario:contraseña:nota)
          <textarea value={d.credenciales} onInput={(e) => set("credenciales", e.currentTarget.value)} />
        </label>
        <label class="wide">
          Instrucciones (Markdown)
          <textarea value={d.instrucciones} onInput={(e) => set("instrucciones", e.currentTarget.value)} />
        </label>
      </div>

      <fieldset class="card stack">
        <legend>Archivo</legend>
        {initial && <p class="muted">Actual: <code>{initial.archivo.nombre}</code> ({formatBytes(initial.archivo.tamano)}). Elige otro archivo solo si quieres reemplazarlo.</p>}
        <input type="file" onChange={(e) => setFile(e.currentTarget.files?.[0] ?? null)} />
        <div class="row">
          <label><input type="checkbox" checked={drive} onChange={(e) => setDrive(e.currentTarget.checked)} /> Subir a Drive</label>
          <label><input type="checkbox" checked={github} onChange={(e) => setGithub(e.currentTarget.checked)} /> Subir a GitHub</label>
        </div>
        <p class="muted">Se trocea en partes de 1,9 GiB y se calcula el SHA-256 aquí, en tu navegador. No cierres la pestaña durante la subida.</p>
        {status && (
          <div>
            <div class="progress" role="progressbar" aria-valuenow={Math.round(status.fraction * 100)} aria-valuemin={0} aria-valuemax={100}>
              <div style={{ width: `${status.fraction * 100}%` }} />
            </div>
            <p class="muted">{status.text}</p>
          </div>
        )}
      </fieldset>

      {error && <p class="notice notice--error" role="alert">{error}</p>}
      <div class="actions">
        <button class="btn btn--primary" type="submit" disabled={busy}>{busy ? "Trabajando…" : "Guardar"}</button>
        {busy && <button class="btn" type="button" onClick={() => abort.current?.abort()}>Cancelar subida</button>}
        {!busy && <button class="btn btn--ghost" type="button" onClick={onCancel}>Volver</button>}
      </div>
    </form>
  );
}
