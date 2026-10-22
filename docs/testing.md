# Administrador habilitado en el dispositivo — 22 de octubre de 2026

- Cuenta de administrador solicitada por el usuario, aprovisionada privadamente en el teléfono conectado. Ningún nombre de acceso, contraseña o verificador real se incorpora al repositorio o APK.
- Verificador PBKDF2-HMAC-SHA256 con sal aleatoria y 600 000 iteraciones, protegido por Android Keystore. Cinco intentos fallidos bloquean un minuto y el bloqueo persiste entre reinicios.
- 44 pruebas de JavaScript/TypeScript, lint y tipado: pasaron.
- Ocho comprobaciones instrumentadas pasaron, incluidas verificación de contraseña, rechazo de clave incorrecta, persistencia de token, revocación y bloqueo entre instancias nativas; usan una cuenta de prueba aislada.
- APK release 1.2.1 instalada, acceso con la credencial autorizada confirmado en el dashboard. Tras forzar cierre y abrir de nuevo, la sesión se restauró.
- La API web continúa pendiente. El emisor de la sesión del dispositivo se distingue del emisor web y sus tokens no se envían al servidor.

# Acceso por usuario y contraseña — 22 de octubre de 2026

- Login sin registro local ni PIN. Endpoint configurado para la futura API `https://arvanto.asyncz.tech/api`.
- Pruebas automatizadas de credenciales, respuestas inválidas, revocación, jornada cerrada, persistencia, expiración, separación de negocios y cierre de sesión interrumpido.
- Pruebas de cierre de caja: finalizar jornada invalida la sesión; cambiar de turno la conserva; un fallo no cierra el acceso.
- `npm run lint`, `npm run typecheck` y 41 pruebas (siete suites): pasaron.
- APK release 1.2.0 compilada e instalada sobre la anterior, sin desinstalar. Verificado en M2101K6R: solo Usuario, Contraseña e Iniciar sesión, sin registro ni PIN.
- Diez migraciones desde una base vacía: integridad SQLite `ok` y estado de acceso inicializado.
- La API aún no existe; las pruebas de autenticación usan respuestas simuladas. No se ha validado un acceso real, ni registro web, ni invalidación entre dispositivos.

# Verificación de React Native sin Expo

Migración del 22 de octubre de 2026. La documentación histórica al final corresponde al entorno anterior.

- Eliminados los paquetes Expo, su runtime, Router y configuración de Metro/Babel/Jest.
- React Navigation registra explícitamente las pantallas y omite rutas sin permiso para el perfil actual.
- Nuevas pruebas de aislamiento de transacciones, rollback y parámetros SQL maliciosos en el adaptador nativo.
- Esquema creado desde cero con las nueve migraciones: `integrity_check=ok`, 15 triggers.
- Antes de actualizar el teléfono M2101K6R: esquema 9, `integrity_check=ok`, cero productos, ventas y usuarios.
- Se conservan el identificador Android, SQLite y las claves de la instalación previa.

- `npm run lint` y `npm run typecheck`: pasaron.
- `npm test`: cuatro suites y 21 pruebas pasaron.
- `app:assembleRelease`: compilación exitosa e instalación mediante `adb install -r`.
- Apertura de la APK release comprobada con Metro apagado: pantalla «Configura tu negocio».
- Siete comprobaciones nativas pasaron en M2101K6R: SQL tipado y triggers, rollback, backup/restauración WAL e integridad, UUID/hash de PIN, AES-GCM y rechazo de clave inválida, Keystore/migración de claves anteriores y generación PDF con OCR local.
- Pruebas instrumentadas usan una variante `smoke` sin minificación y bases de datos independientes; no crean usuarios, productos ni ventas en la base del negocio.

Para repetir las pruebas nativas:

```bash
cd android
./gradlew app:assembleSmoke app:assembleSmokeAndroidTest -PreactNativeArchitectures=arm64-v8a
adb install -r app/build/outputs/apk/smoke/app-smoke.apk
adb install -r app/build/outputs/apk/androidTest/smoke/app-smoke-androidTest.apk
adb shell am instrument -w mx.arvanto.ferrepos.test/mx.arvanto.ferrepos.ArvantoSmokeInstrumentation
# Volver a instalar la variante release al terminar.
```

La lectura de códigos con cámara, el selector de documentos, el menú de compartir y la impresión sobre papel requieren prueba manual con el hardware y proveedores de la tienda. No se completó una venta real ni se eligió un PIN en nombre del usuario.

## Historial anterior a la migración

# Verificación

## Entorno

- Node.js 26.12.0 y npm 12.2.1.
- OpenJDK 25 disponible.
- Dispositivo Android conectado por ADB para la verificación de CRUD.

## Resultados

- `npx expo lint`: pasó.
- `npx tsc --noEmit`: pasó.
- `npm test`: pasó, 3 suites y 18 casos sobre dinero, productos y cálculos de venta/caja.
- `npx expo-doctor`: 20/20 comprobaciones.
- `npx expo export --platform android`: pasó; Metro creó el bundle Android.
- `npx expo run:android`: build debug nativa del CRUD pasó en 30 s y se instaló en M2101K6R. Se abrió el catálogo vacío y el formulario de producto. La migración 2 se confirmó en SQLite del dispositivo. No se completó un alta manual en el dispositivo.
- `npx expo run:android`: build con venta, caja y respaldo pasó (9 s incremental). La migración 3 y `PRAGMA integrity_check` (`ok`) se confirmaron en la SQLite del dispositivo. Abrieron las pantallas Venta y Caja; se abrió el formulario de apertura sin crear un turno de prueba.
- En Android se creó un `.fpbackup` cifrado de 120 KB, abrió la hoja de compartir y se restauró desde Descargas; la app confirmó la restauración y registró la hora. No se registró una venta de prueba porque el catálogo local estaba vacío.
- Se leyó la SQLite creada en el dispositivo: migración 1 aplicada, tablas `schema_migrations`, `business_settings`, `products`, negocio provisional y moneda MXN. Tras forzar cierre y relanzar la app, la migración y los ajustes siguieron presentes.
- `npm audit --omit=dev --audit-level=high`: encontró dependencias transitivas vulnerables en la cadena Expo/Metro y `node-forge`; npm propone como arreglo forzado bajar Expo a 44. No se aplicó porque rompe el SDK seleccionado. Revisar en una actualización compatible de Expo. La instalación de Jest también muestra avisos en dependencias de desarrollo; el audit completo registra 54 vulnerabilidades (26 moderadas, 28 altas).

La migración, backup, restauración y pantallas se comprobaron en el dispositivo. La transacción de venta se verifica con cálculos de dominio y TypeScript, pero no se completó una venta manual sin productos de catálogo disponibles. El selector y compartir dependen de proveedores Android. El build debug requiere Metro.
