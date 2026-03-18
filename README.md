# Botsniok API v3.0.0

Bot de Telegram que monitorea canales fuente, traduce el contenido automáticamente y lo reenvía a canales destino privados. Diseñado para creadores de contenido que recopilan noticias en múltiples idiomas y las publican en español.

## Flujo de trabajo

```
Canales de terceros ──(reenvío manual)──> Canal auxiliar (SOURCE)
                                              │
                                         Bot detecta
                                              │
                                     Traduce al español
                                              │
                                   ┌──────────┼──────────┐
                                   ▼          ▼          ▼
                              Canal A     Canal B     Canal N
                             (destino)   (destino)   (destino)
```

1. Encuentras noticias en canales de cualquier idioma
2. Reenvías manualmente las que te interesan a tu canal auxiliar
3. El bot traduce y reenvía automáticamente a tus canales destino

## Requisitos previos

- **Node.js** >= 18
- **Bot de Telegram** creado con [@BotFather](https://t.me/BotFather)
- **Google Cloud Translation API** con credenciales (archivo JSON de service account)
- El bot debe ser **administrador** en los canales destino (con permiso de enviar mensajes y fijar)

## Instalación

```bash
# Clonar el repositorio
git clone <repo-url>
cd botsniok-api

# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus valores

# Desarrollo
npm run dev

# Producción
npm run build
npm start
```

## Configuración (.env)

### Variables requeridas

| Variable | Descripción | Ejemplo |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Token del bot de BotFather | `7030638970:AAE...` |
| `SOURCE_CHANNEL_IDS` | IDs de canales fuente (auxiliares) | `-1002036338717` |
| `PRIVATE_CHANNEL_IDS` | IDs de canales destino | `-1001735518912,-1001234567890` |
| `API_KEY` | Clave para proteger endpoints HTTP | `bnok_B9EnDotns...` |
| `ALLOWED_TELEGRAM_IDS` | IDs de usuarios autorizados | `1522265480,987654321` |
| `GOOGLE_APPLICATION_CREDENTIALS` | Ruta al JSON de Google Cloud | `./google_credentials.json` |

### Variables opcionales

| Variable | Default | Descripción |
|---|---|---|
| `TARGET_LANGUAGE` | `es` | Idioma destino para traducciones |
| `PORT` | `3000` | Puerto del servidor HTTP |
| `NODE_ENV` | `development` | Entorno (`development` / `production`) |
| `SKIP_SAME_LANGUAGE` | `true` | Omitir traducción si el texto ya está en el idioma destino |
| `DEDUP_WINDOW_HOURS` | `24` | Horas de ventana para detección de duplicados |
| `SHOW_INLINE_BUTTONS` | `false` | Mostrar botones de votación (👍/👎) en mensajes reenviados |
| `SCHEDULED_MESSAGE_TIME` | _(vacío)_ | Hora para mensajes programados (formato `HH:MM`) |
| `LOG_LEVEL` | `info` | Nivel de log (`debug`, `info`, `warn`, `error`) |

## Comandos del bot

Se envían al bot en chat directo. Solo usuarios con su ID en `ALLOWED_TELEGRAM_IDS` pueden usarlos.

| Comando | Descripción |
|---|---|
| `/start` | Verificar que el bot está online |
| `/p <mensaje o URL>` | Enviar y fijar un mensaje en todos los canales destino |
| `/status` | Estado del bot, uptime, tamaño de caches |
| `/stats` | Estadísticas de uso (mensajes, traducciones, errores) |
| `/sources` | Lista de canales fuente monitoreados |
| `/pause` | Pausar el reenvío de mensajes |
| `/resume` | Reanudar el reenvío de mensajes |
| `/scheduled` | Info sobre mensajes programados |
| `/help` | Lista de comandos |

### Ejemplo del comando `/p`

```
/p ⚠️ Actualización importante: nuevo reporte disponible en el canal
/p https://t.me/militarysummary/12345
```

El bot envía el mensaje a cada canal destino y lo fija automáticamente.

## API REST

### Sin autenticación

```http
GET /health
```
Devuelve estado del bot, uptime y tamaño de caches.

```http
GET /stats
```
Devuelve estadísticas detalladas de uso.

### Con autenticación (header `X-API-Key`)

```http
POST /start-bot
```
Inicia el bot (polling + forwarding + scheduler).

```http
POST /stop-bot
```
Detiene el bot.

**Ejemplo (PowerShell):**
```powershell
Invoke-RestMethod -Method POST -Headers @{"X-API-Key"="tu-api-key"} http://localhost:3000/start-bot
```

**Ejemplo (bash/curl):**
```bash
curl -X POST -H "X-API-Key: tu-api-key" http://localhost:3000/start-bot
```

## Arquitectura

```
src/
├── config/
│   └── config.ts                # Variables de entorno y configuración
├── handlers/
│   ├── callbackHandler.ts       # Sistema de votación inline
│   ├── commandHandler.ts        # Comandos del bot (/start, /p, /status, etc.)
│   └── messageHandler.ts        # Reenvío de posts de canales
├── middleware/
│   ├── auth.ts                  # Validación de API key
│   └── errorHandler.ts          # Manejo global de errores
├── services/
│   ├── telegramService.ts       # Inicialización del bot y envío de mensajes
│   ├── translationService.ts    # Google Translate con caché
│   ├── deduplicationService.ts  # Detección de duplicados (texto/archivo/URL)
│   ├── retryQueue.ts            # Cola de reintentos con backoff exponencial
│   ├── rateLimiter.ts           # Rate limiting (global + por chat)
│   ├── statsService.ts          # Métricas de uso
│   └── scheduledMessageService.ts # Mensajes programados diarios
├── types/
│   └── index.ts                 # Interfaces TypeScript
├── utils/
│   └── logger.ts                # Logger (Pino)
├── index.ts                     # Entry point del bot
└── server.ts                    # Servidor Express
```

## Features

- **Traducción automática** con Google Cloud Translation API v2 (con caché de 1 hora)
- **Media groups (álbumes)** — reenvía fotos/videos agrupados manteniendo el formato
- **Deduplicación** — detecta contenido duplicado por texto, archivo y URL
- **Rate limiting** — respeta los límites de la API de Telegram (25 msg/seg global, 18 msg/min por chat)
- **Cola de reintentos** — reintenta automáticamente con backoff exponencial ante errores transitorios
- **Mensajes programados** — envío diario de mensajes fijados a hora configurable
- **Votación inline** — botones opcionales de 👍/👎 en mensajes reenviados
- **Pin remoto** — `/p` envía y fija mensajes en canales destino desde chat privado
- **Pausa/reanudación** — control manual del reenvío sin detener el bot
- **API REST** — endpoints para monitoreo y control remoto
- **Whitelist** — solo usuarios autorizados pueden usar los comandos

## Scripts

| Script | Descripción |
|---|---|
| `npm run dev` | Desarrollo con hot-reload (tsx) |
| `npm run build` | Compilar TypeScript a JavaScript |
| `npm start` | Ejecutar versión compilada |
| `npm test` | Ejecutar tests (Vitest) |
| `npm run test:watch` | Tests en modo watch |

## Notas

- El archivo de credenciales de Google (`GOOGLE_APPLICATION_CREDENTIALS`) **no debe** subirse al repositorio. Está incluido en `.gitignore`.
- El archivo `.env` contiene secretos y tampoco debe subirse al repositorio.
- El bot usa polling (no webhooks), ideal para desarrollo y servidores sin IP pública.
