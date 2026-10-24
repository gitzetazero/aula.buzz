# Contribuir

¡Gracias por ayudar! Antes de abrir un PR:

```bash
pnpm install
pnpm test && pnpm typecheck && pnpm build
```

- **Catálogo** (`apps/recursos/catalog/resources.yaml`): lo normal es generarlo con `pnpm publish-resource`.
  El build falla si una entrada no cumple el esquema (`apps/recursos/src/lib/schema.ts`).
- **Credenciales** en la ficha: solo las credenciales *por defecto* de máquinas de laboratorio. Nunca contraseñas reales.
- **Secretos**: nunca en el repo. Van en las variables de Cloudflare (ver `.env.example`).
- **Archivos propietarios**: no subas nada que no puedas redistribuir; los mirrors son privados por una razón.
- Los cambios en el motor de descarga (`apps/recursos/src/lib/download.ts`) necesitan test.
- Textos de la interfaz en español.
