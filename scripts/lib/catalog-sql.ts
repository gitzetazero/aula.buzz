import { parseResource } from "@aula/db";

const quote = (s: string) => `'${s.replaceAll("'", "''")}'`;

/** SQL que inserta o reemplaza (por id) un recurso en la tabla `resources` de D1. */
export function upsertSql(entry: unknown): string {
  const r = parseResource(entry); // lanza si no cumple resourceSchema
  const data = quote(JSON.stringify(r));
  return (
    `INSERT INTO resources (id, data, updated) VALUES (${quote(r.id)}, ${data}, ${quote(r.actualizado)}) ` +
    `ON CONFLICT(id) DO UPDATE SET data = ${data}, updated = ${quote(r.actualizado)};\n`
  );
}
