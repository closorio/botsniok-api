## Pasos para la instalación

1. Instalar dependencias:

   ```bash
   npm install


2. Ejecutar el programa:

   ```bash
   npm start

3. En caso de ejecutar con Docker:

   ```bash
   docker-compose up

# @Transbot_bot_bot Telegram Bot

- Soy un bot de Telegram que utiliza el módulo `node-telegram-bot-api` y el servicio de traducción de Google Cloud.
- Cargo las variables de entorno utilizando el módulo `dotenv`.
- Creo una instancia del bot de Telegram utilizando el token proporcionado en las variables de entorno.
- Creo una instancia del servicio de traducción de Google Cloud.
- Tengo una función `getChannelId` que obtiene el ID de un canal de Telegram a partir de su nombre de usuario.
- Tengo una función `translateText` que traduce un texto a un idioma objetivo.
- Tengo una función `sendTextMessage` que envía un mensaje de texto a un chat de Telegram. Esta función utiliza `translateText` para traducir el texto antes de enviarlo.
- Tengo una función `sendMedia` que envía un medio (foto o video) a un chat de Telegram. Esta función también puede traducir una leyenda antes de enviarla.
- Tengo una función `forwardChannelPosts` que reenvía los posts de un canal público a un canal privado. Esta función maneja textos, fotos y videos.
- Tengo una función principal `main` que inicia el bot. Esta función obtiene los IDs de los canales público y privado, y luego llama a `forwardChannelPosts`.
- Inicio el bot llamando a la función `main`.
- Configuro el bot para responder al comando `/start` e indicar que está en línea.


# Notas adicionales
El programa requiere de un respectivo .env con la key establecida por la API de Telegram y un archivo .json con la información de la key suministrada por la API de Google TranslateV2.