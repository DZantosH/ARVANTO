# ARVANTO

Punto de venta Android para ferreterías, desarrollado con **React Native 0.88 y TypeScript, sin Expo**. La APK release incluye el código JavaScript y funciona sin Metro ni conexión con una computadora.

## Desarrollo

Requiere Node.js compatible con React Native 0.88, JDK 17 o superior, Android SDK 37 y un teléfono con depuración USB o un emulador. Configura `ANDROID_HOME` con la ubicación del SDK y acepta sus licencias.

```bash
npm ci
npm start
# En otra terminal, con el teléfono conectado:
npm run android
```

La variante debug necesita Metro y `adb reverse tcp:8081 tcp:8081`. Para instalar una variante que abra por sí sola:

```bash
npm run android:release
```

El APK se genera en `android/app/build/outputs/apk/release/app-release.apk`. La firma actual es de desarrollo para permitir actualizar el teléfono de trabajo; configura una clave propia antes de distribuir públicamente. No desinstales la app para actualizar: instala encima para conservar los datos.

## Acceso y registro web

La app solo muestra **Usuario**, **Contraseña** e **Iniciar sesión**. El registro, recuperación de contraseña y permisos pertenecen a la futura web `https://arvanto.asyncz.tech`.

El servidor todavía no está implementado. La app está preparada para su API en `https://arvanto.asyncz.tech/api`; no incluye cuentas de prueba ni autentica con PIN local. Las cuentas web estarán disponibles cuando se despliegue ese servicio. Por solicitud del usuario se admite una cuenta de administrador aprovisionada de forma privada en su teléfono para operar mientras tanto. Esa cuenta no se incluye en el código, la APK ni los respaldos; se verifica localmente con PBKDF2-HMAC-SHA256 y Android Keystore. El contrato requerido está en [docs/auth-api.md](docs/auth-api.md).

Una sesión autenticada se guarda cifrada con Android Keystore y se recupera al reabrir la app. No se guarda la contraseña ni se cierra la sesión por dejar la app en segundo plano. El cierre manual o la opción **Finalizar jornada y cerrar sesión** en el corte de caja invalidan el acceso guardado. Un cambio de turno puede conservar la sesión desactivando esa opción. Sin internet se conserva una sesión previamente validada hasta su vencimiento; un cierre remoto se detecta al recuperar conectividad.

## Organización

- `App.tsx`: navegación con React Navigation y pantallas disponibles según el perfil.
- `src/screens/`: productos, ventas, caja, respaldos, inventario, clientes, compras, reportes y usuarios.
- `src/database/`: repositorios y diez migraciones SQLite.
- `src/native/`: acceso TypeScript a los servicios Android.
- `android/`: proyecto nativo mantenido directamente, sin generación de Expo.

SQLite se conserva en `files/SQLite/ferrepos.db`, con el mismo identificador de aplicación `mx.arvanto.ferrepos`. Las claves anteriores se recuperan y se vuelven a cifrar con Android Keystore durante la actualización.

Los respaldos usan AES-256-GCM. La impresión utiliza el servicio de impresión del sistema; PDF e imágenes se reconocen localmente con ML Kit. El escáner utiliza Google Play Services y puede necesitar descargar su componente la primera vez; también se admite introducir el código manualmente. La base SQLite local sigue sin cifrado.

Esta versión incluye el proyecto nativo de Android. Una versión iOS requiere implementar los mismos servicios nativos en esa plataforma.

## Comprobaciones

```bash
npm run lint
npm run typecheck
npm test
```

Consulta [docs/testing.md](docs/testing.md) para resultados y límites de las pruebas.
