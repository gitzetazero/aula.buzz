import { isMap, isSeq, parseDocument, YAMLMap, YAMLSeq } from "yaml";

/** Inserta o sustituye (por `id`) una entrada de `recursos`, conservando los comentarios del archivo. */
export function upsertResource(yamlText: string, entry: { id: string } & Record<string, unknown>): string {
  const doc = parseDocument(yamlText);
  let seq = doc.get("recursos", true);
  if (!isSeq(seq)) {
    seq = new YAMLSeq();
    doc.set("recursos", seq);
  }
  const list = seq as YAMLSeq;
  list.flow = false; // `recursos: []` pasa a lista en bloque

  const node = doc.createNode(entry);
  const index = list.items.findIndex((item) => isMap(item) && (item as YAMLMap).get("id") === entry.id);
  if (index >= 0) list.items[index] = node;
  else list.items.push(node);
  return doc.toString({ lineWidth: 0 });
}
