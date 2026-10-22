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

## Organización

- `App.tsx`: navegación con React Navigation y pantallas disponibles según el perfil.
- `src/screens/`: productos, ventas, caja, respaldos, inventario, clientes, compras, reportes y usuarios.
- `src/database/`: repositorios y nueve migraciones SQLite.
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
