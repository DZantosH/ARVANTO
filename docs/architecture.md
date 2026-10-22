# Arquitectura

## Aplicación Android

React Native 0.88 y TypeScript estricto, compilados con Community CLI y Gradle. `index.js` registra `App.tsx`. React Navigation gestiona las pestañas y el stack. Las pantallas en `src/screens/` conservan su interfaz y reglas de negocio; las rutas disponibles dependen del usuario activo.

No se utiliza Expo, EAS ni generación automática de proyectos nativos. El proyecto `android/` contiene las fuentes, recursos, manifiesto y configuración de compilación.

## Persistencia

`src/database/` contiene repositorios y nueve migraciones. `src/native/database.tsx` serializa el acceso y mantiene cada transacción exclusiva hasta COMMIT o ROLLBACK. Android SQLite usa parámetros tipados, WAL y claves foráneas. El dinero se guarda en centavos enteros.

Se conserva `files/SQLite/ferrepos.db` y el identificador `mx.arvanto.ferrepos` para actualizaciones sobre instalaciones anteriores.

## Servicios nativos

`ArvantoPlatform.kt` expone SQLite, archivos privados, el selector del sistema, compartir mediante FileProvider, cifrado AES-GCM, Android Keystore, impresión, exportación PDF, OCR y escaneo de códigos. `src/native/platform.ts` proporciona los tipos y conversiones para las pantallas y repositorios.

La API de impresión utiliza WebView sin JavaScript, acceso a archivos ni red. PDF e imágenes usan ML Kit local. El escáner delega la captura a Google Play Services; la entrada manual de códigos funciona sin ese componente.

Los respaldos toman un snapshot SQLite tras checkpoint de WAL y lo cifran con una clave de 256 bits. La restauración autentica AES-GCM, revisa integridad y migraciones y crea una copia previa. Las claves de la versión anterior se descifran con el Keystore existente y se vuelven a guardar en el nuevo almacén, sin incorporar su runtime.

## Acceso local y límites

El PIN con salt mantiene el formato anterior para conservar los accesos. Los perfiles limitan rutas y algunas operaciones administrativas. La base local sigue sin cifrado y no existe servidor de autenticación ni sincronización. La bitácora local no es inmutable ante acceso directo a la base.

Android es la plataforma nativa implementada. iOS requiere implementar los servicios equivalentes. La impresión física depende del servicio y la impresora instalados; Bluetooth ESC/POS directo no está incluido.
