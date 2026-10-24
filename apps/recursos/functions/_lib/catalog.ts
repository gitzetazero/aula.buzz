import data from "../../src/generated/catalog.json";

interface PartIds {
  tamano: number;
  github_asset_id?: number;
  drive_id?: string;
}

export const MIRRORS: string[] = data.mirrors;
const resources = new Map<string, PartIds[]>(
  (data.recursos as { id: string; partes: PartIds[] }[]).map((r) => [r.id, r.partes]),
);

export function getParts(resourceId: string): PartIds[] | undefined {
  return resources.get(resourceId);
}

export function hasGithubAsset(assetId: number): boolean {
  for (const parts of resources.values()) if (parts.some((p) => p.github_asset_id === assetId)) return true;
  return false;
}
