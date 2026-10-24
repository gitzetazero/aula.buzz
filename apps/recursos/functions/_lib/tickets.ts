import { getDriveToken, driveFileUrl, type ServiceAccount } from "./gdrive.ts";

export interface Source {
  mirror: string;
  url: string;
  headers?: Record<string, string>;
}

interface PartIds {
  github_asset_id?: number;
  drive_id?: string;
}

/**
 * Fuentes de una parte, en el orden de `mirrors`. GitHub no envía CORS, así
 * que se sirve por el proxy del mismo origen; Drive va directo al navegador.
 */
export async function buildSources(
  part: PartIds,
  mirrors: string[],
  opts: { driveAccount?: ServiceAccount; githubConfigured: boolean },
): Promise<Source[]> {
  const sources: Source[] = [];
  for (const mirror of mirrors) {
    if (mirror === "drive" && part.drive_id && opts.driveAccount) {
      try {
        const { token } = await getDriveToken(opts.driveAccount);
        sources.push({ mirror, url: driveFileUrl(part.drive_id), headers: { Authorization: `Bearer ${token}` } });
      } catch {
        // Si Drive no está disponible, el resto de mirrors siguen valiendo.
      }
    } else if (mirror === "github" && part.github_asset_id && opts.githubConfigured) {
      sources.push({ mirror, url: `/api/gh/${part.github_asset_id}` });
    }
  }
  return sources;
}
