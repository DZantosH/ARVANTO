# Arquitectura

## Aplicación Android

React Native 0.88 y TypeScript estricto, compilados con Community CLI y Gradle. `index.js` registra `App.tsx`. React Navigation gestiona las pestañas y el stack. Las pantallas en `src/screens/` conservan su interfaz y reglas de negocio; las rutas disponibles dependen del usuario activo.

No se utiliza Expo, EAS ni generación automática de proyectos nativos. El proyecto `android/` contiene las fuentes, recursos, manifiesto y configuración de compilación.

## Persistencia

`src/database/` contiene repositorios y diez migraciones. `src/native/database.tsx` serializa el acceso y mantiene cada transacción exclusiva hasta COMMIT o ROLLBACK. Android SQLite usa parámetros tipados, WAL y claves foráneas. El dinero se guarda en centavos enteros.

Se conserva `files/SQLite/ferrepos.db` y el identificador `mx.arvanto.ferrepos` para actualizaciones sobre instalaciones anteriores.

## Servicios nativos

`ArvantoPlatform.kt` expone SQLite, archivos privados, el selector del sistema, compartir mediante FileProvider, cifrado AES-GCM, Android Keystore, impresión, exportación PDF, OCR y escaneo de códigos. `src/native/platform.ts` proporciona los tipos y conversiones para las pantallas y repositorios.

La API de impresión utiliza WebView sin JavaScript, acceso a archivos ni red. PDF e imágenes usan ML Kit local. El escáner delega la captura a Google Play Services; la entrada manual de códigos funciona sin ese componente.

Los respaldos toman un snapshot SQLite tras checkpoint de WAL y lo cifran con una clave de 256 bits. La restauración autentica AES-GCM, revisa integridad y migraciones y crea una copia previa. Las claves de la versión anterior se descifran con el Keystore existente y se vuelven a guardar en el nuevo almacén, sin incorporar su runtime.

## Acceso local y límites

El acceso usa usuario y contraseña contra la futura API de la web. La contraseña no se guarda. Solo se persisten el token, identidad, negocio y jornada en el almacén protegido por Android Keystore. Las identidades locales son referencias para operaciones y bitácora, sin credenciales locales ni altas desde la app.

`app_auth_state.session_epoch` invalida de forma persistente los accesos guardados. El corte que finaliza el negocio incrementa ese contador dentro de la misma transacción de caja. El cierre manual guarda además una marca de revocación protegida; así un cierre interrumpido no restaura el token anterior. Los cierres remotos pendientes se reintentan antes de permitir el siguiente acceso. No hay cierre por inactividad o por pasar a segundo plano.

Se comprueba la sesión al regresar y cada 30 segundos mientras la app está activa. Un error de red conserva una sesión ya autenticada y no vencida; una revocación o jornada cerrada la elimina. Los datos locales siguen sin cifrado SQLite y no hay sincronización de productos o ventas. El backend de cuentas y registro aún está pendiente.

Android es la plataforma nativa implementada. iOS requiere implementar los servicios equivalentes. La impresión física depende del servicio y la impresora instalados; Bluetooth ESC/POS directo no está incluido.

## Aprovisionamiento privado de un dispositivo

Por autorización expresa del usuario se admite un administrador instalado con herramientas externas a la interfaz mientras se implementa la web. La APK no contiene cuentas predeterminadas. El módulo nativo verifica PBKDF2-HMAC-SHA256 contra un registro cifrado con Android Keystore, emite un token local revocable y aplica un bloqueo persistente tras cinco fallos. La sesión usa el emisor `arvanto:device`, conserva el acceso al reabrir y se invalida al cerrar sesión o finalizar la jornada. El alta web y la vinculación del negocio local al identificador del servidor requieren una migración cuando el servicio esté disponible.
