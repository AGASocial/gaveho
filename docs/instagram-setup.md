# Conectar una cuenta de Instagram a GAVEHO

Guía paso a paso para agregar una cuenta nueva al publicador de `gaveho.com/admin/social`.
Nunca pegues tokens ni secretos en este repo, en issues o en chats.

## 1. La cuenta de Instagram debe ser Profesional

En la app de Instagram: Configuración → Tipo de cuenta y herramientas → Cambiar a cuenta profesional
(Empresa o Creador).

## 2. App en Meta for Developers

1. Entra a <https://developers.facebook.com/apps> con la cuenta **AGA Social** y el portfolio comercial **AGA Social**.
2. Si aún no existe, crea una app con el caso de uso **"Administrar mensajes y contenido en Instagram"**.
   - El login solo-Instagram ya no está disponible para apps nuevas: usa **"API setup with Unified login"**.
3. Una sola app puede tener muchas cuentas (p. ej. `gaveho_ai`, `cadenza.ops`, Kari Decor). No crees una app por cuenta.

## 3. Agregar la cuenta como Instagram Tester

1. En la app: **Roles de la app → Roles → Agregar personas → Instagram Tester**, con el usuario de la cuenta.
2. Desde esa cuenta de Instagram, acepta la invitación en
   <https://www.instagram.com/accounts/manage_access/> → pestaña **Invitaciones de prueba (Test invites)**.

## 4. Generar el token

En **Casos de uso → Administrar mensajes y contenido en Instagram → API setup with Unified login**:

1. **Omite el paso 1** (configuración / URL de redirección); GAVEHO no usa OAuth.
2. En el **paso 2, "Generar tokens de acceso"**, agrega la cuenta de Instagram y genera un
   **token de usuario del sistema que no caduca**. Cópialo (empieza con `IG…` o `EA…`).

## 5. Pegarlo en GAVEHO

1. Abre <https://gaveho.com/admin/social> (sesión de admin).
2. En **Accounts → Agregar cuenta**, escribe un nombre opcional y pega el token. Si la cuenta no se detecta
   automáticamente (p. ej. tokens de usuario del sistema sin página de Facebook), escribe también el
   **Instagram account ID** (numérico, `1784…`, visible en Meta Business Suite o en la configuración de la API).
3. GAVEHO valida el token contra Meta (`graph.instagram.com`, o `graph.facebook.com` para tokens de Facebook login),
   obtiene el usuario e ID de Instagram, y lo guarda cifrado. Si la cuenta ya existe, se reemplaza su token.
4. Para quitar una cuenta usa **remove** (borra también sus posts guardados) o **disable** para pausarla.

## Reels

En `/admin/social`, elige **Reel**: sube un video MP4/MOV (3 s–15 min, ≤ 300 MB, 9:16 recomendado), opcionalmente una portada o el segundo de la miniatura, y "Also share to feed" (activado por defecto). No se transcodifica: si el archivo no cumple, se rechaza con un error claro.

- El video sube directo del navegador a Supabase Storage (bucket `gaveho-social`, carpeta `reels/`) con una URL firmada, porque Vercel limita el cuerpo de las funciones a ~4.5 MB.
- El bucket acepta `image/jpeg`, `video/mp4` y `video/quicktime` hasta 300 MB (migración `20261103100000_gaveho_social_reels.sql`). **Además**, Supabase tiene un límite global de subida por proyecto (Dashboard → Storage → Settings → "Upload file size limit", 50 MB por defecto). Debe ser ≥ 300 MB para videos grandes.
- Publicación (igual en graph.instagram.com y graph.facebook.com): contenedor `media_type=REELS` + `video_url` → se consulta `status_code` hasta `FINISHED` → `media_publish` → permalink. Si Meta sigue procesando tras ~40–60 s, el post queda en `publishing` y el cron `/api/internal/social-publisher` (cada 15 min, `maxDuration` 300) lo termina. `ERROR`/`EXPIRED` → `failed` (se puede reintentar; se crea un contenedor nuevo).
- Codecs recomendados por Meta: H.264 o HEVC, audio AAC, 23–60 fps.

## Variables de entorno en Vercel

| Variable | Uso |
| --- | --- |
| `SOCIAL_TOKEN_ENCRYPTION_KEY` | Cifra los tokens (AES-256-GCM). 32 bytes en base64: `openssl rand -base64 32`. No la cambies después de agregar cuentas. |
| `CRON_SECRET` | Protege los crons `/api/internal/social-publisher` y `/api/internal/social-token-refresh`. |
| `NEXT_PUBLIC_SITE_URL` | URL pública del sitio. |
| `META_GRAPH_API_VERSION` | Opcional (por defecto `v23.0`). |

Ya **no** se necesitan `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET` ni `INSTAGRAM_REDIRECT_URI`.
Los tokens que no caducan no se refrescan; el cron los omite.
