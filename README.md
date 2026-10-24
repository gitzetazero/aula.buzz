# aula.buzz

Plataforma open source (MIT) para una clase. Cada sección vive en su subdominio y comparten el login.

| Sitio | Qué es |
|---|---|
| `aula.buzz` (`apps/portal`) | Portal: menú de secciones y cabecera común |
| `recursos.aula.buzz` (`apps/recursos`) | **Recursos**: VMs, ISOs y archivos de clase, que se guardan **directamente en la raíz de tu USB** |

## Cómo funciona Recursos

- El navegador (Chrome, Edge… cualquier Chromium) escribe el archivo en el USB con la
  [File System Access API](https://developer.mozilla.org/docs/Web/API/File_System_API).
  El usuario elige la raíz de su USB una vez; después aparece en «Mi USB».
- Los archivos grandes se guardan **troceados en partes de 1,9 GiB** (límite de GitHub) y el navegador las une
  en un único archivo. Cada parte y el total tienen su SHA-256, y se verifica al terminar.
- **Dos mirrors**, GitHub Releases (repo privado) y Google Drive. Si uno falla (cuota, error, corte), se continúa
  con el otro **desde el mismo byte**.
- Los bytes **no pasan por Cloudflare** salvo en GitHub, que no envía CORS y necesita un proxy del mismo origen
  (`functions/api/gh/[assetId].ts`). Por eso `config/mirrors.yaml` pone **Drive primero**: va directo al navegador.
- El acceso lo controla Cloudflare Access (lista de emails). Los archivos nunca son públicos.

```
Navegador ──(Cloudflare Access)──► recursos.aula.buzz ── POST /api/ticket ──► fuentes por parte
   ├──► Google Drive API (token de service account, 1 h)   directo al navegador
   └──► /api/gh/<asset>  (proxy en streaming) ──► GitHub release privado
```

## Desarrollo

Requisitos: Node 22+ y pnpm 10 (`corepack enable`).

```bash
pnpm install
pnpm test        # vitest
pnpm typecheck
pnpm build
pnpm e2e         # Playwright; con PW_CHROMIUM=/ruta/a/chromium si no usas el de Playwright
```

Para ver Recursos en local con datos de prueba, copia `.env.example` a `apps/recursos/.dev.vars`, pon
`AUTH_DEV_EMAIL=yo@ejemplo.com` (solo funciona en `localhost`) y ejecuta `pnpm --filter @aula/recursos dev`.

## Publicar un recurso

```bash
pnpm publish-resource ./kali.ova --id kali-2026-1 --nombre "Kali Linux 2026.1" \
  --descripcion "VM del módulo de seguridad" --asignatura "Seguridad" --tipo vm --so "Kali Linux" \
  --github-repo usuario/aula-recursos --rclone-remote gdrive:aula-recursos
```

Trocea y calcula los hashes, sube a los mirrors y añade la entrada a `apps/recursos/catalog/resources.yaml`.
Revisa el cambio, haz commit y push. Requiere [`gh`](https://cli.github.com) autenticado y
[`rclone`](https://rclone.org) con un remote de Google Drive. Usa `--dry-run` para probar sin subir nada.

## Despliegue (guía para tu propia clase)

> Los pasos de Cloudflare y Google no se han podido probar de extremo a extremo desde el entorno de desarrollo;
> si algo no cuadra con la interfaz actual, abre un issue.

1. **GitHub:** crea un repo **privado** (`aula-recursos`) y un token *fine-grained* con permiso de solo lectura de
   *Contents* sobre ese repo → `GH_ASSETS_TOKEN`, y `GH_ASSETS_REPO=usuario/aula-recursos`.
2. **Google Drive:** en Google Cloud crea un proyecto, activa la *Google Drive API*, crea una *service account* y
   descarga su clave JSON → `GDRIVE_SA_JSON` (el JSON entero). En Drive, **comparte la carpeta de recursos con el
   email de la service account como «Lector»** (sin enlace público).
3. **Cloudflare Pages:** dos proyectos desde este repo.
   - `apps/portal` → dominio `aula.buzz`.
   - `apps/recursos` → dominio `recursos.aula.buzz`.

   Directorio raíz de cada proyecto: su carpeta. Comando de build: `pnpm install --frozen-lockfile && pnpm build`.
   Directorio de salida: `dist`. Variables (en Settings → Variables and Secrets): ver `.env.example`.
4. **Cloudflare Access (Zero Trust):** **una sola aplicación** que cubra `aula.buzz` y `*.aula.buzz`, con una política
   que permita la lista de emails de tu clase y login por código de un solo uso. Copia el *Application Audience
   (AUD)* a `ACCESS_AUD` y tu dominio de equipo a `ACCESS_TEAM_DOMAIN`.
   Gratis hasta 50 usuarios.

## Notas y límites

- Escribir en el USB solo funciona en navegadores Chromium. En otros solo hay descarga normal para recursos de una sola
  parte con GitHub.
- Si cierras la pestaña a mitad de una descarga, esta se **reinicia** (Chromium escribe en un archivo temporal que solo
  se confirma al terminar). Dentro de la misma sesión el cambio de mirror sí continúa desde el byte donde se quedó.
- Los USB en **FAT32** no admiten archivos de más de 4 GB: formatea en exFAT.
- El navegador no puede listar las unidades conectadas; el usuario elige su USB una vez.
- Respeta las licencias: no publiques en un repo/Drive abierto software propietario que no puedas redistribuir.

## Licencia

[MIT](LICENSE)
