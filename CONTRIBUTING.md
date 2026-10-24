# Contribuir

¡Gracias por ayudar! Antes de abrir un PR:

```bash
pnpm install
pnpm test && pnpm typecheck && pnpm build
```

- **Catálogo** (tabla `resources` de D1): se gestiona desde `/admin` o con `pnpm publish-resource`.
  Se rechaza toda entrada que no cumpla el esquema (`packages/db/src/schema.ts`).
- **Credenciales** en la ficha: solo las credenciales *por defecto* de máquinas de laboratorio. Nunca contraseñas reales.
- **Secretos**: nunca en el repo. Van en las variables de Cloudflare (ver `.env.example`).
- **Archivos propietarios**: no subas nada que no puedas redistribuir; los mirrors son privados por una razón.
- Los cambios en el motor de descarga (`apps/recursos/src/lib/download.ts`) necesitan test.
- Textos de la interfaz en español.
