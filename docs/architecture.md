# Arquitectura

## Base elegida

- **Expo SDK 58, React Native 0.88 y TypeScript estricto:** base Android mantenida con módulos Expo compatibles por SDK.
- **Expo Router:** rutas basadas en archivos, incluidas en la plantilla oficial; se conserva una navegación mínima mientras solo existe Inicio.
- **expo-sqlite:** SQLite persistente en el dispositivo. La instalación usa `npx expo install` para resolver la versión compatible con SDK 58. No hay API ni inicio de sesión remoto.
- **Repositorios explícitos:** las consultas viven en `src/database`, fuera de las pantallas. La interfaz recibe el contexto SQLite mediante `SQLiteProvider`.
- **Dinero en centavos enteros:** los importes persistidos usarán enteros; se formatean al presentar con `Intl.NumberFormat('es-MX', { currency: 'MXN' })`.

Referencias versionadas: [Expo SQLite SDK 58](https://docs.expo.dev/versions/v58.0.0/sdk/sqlite/) y [Expo Router](https://docs.expo.dev/versions/v58.0.0/sdk/router/).

## Límites de capas

`app/` contiene navegación y pantallas; `src/database/` contiene migraciones y consultas; `src/domain/` recibirá entidades y reglas de negocio puras; `src/infrastructure/` recibirá adaptadores de archivos, impresión y hardware cuando se implementen. Los componentes no deben escribir directamente SQL en la interfaz.

## Persistencia y cambios de esquema

`ferrepos.db` usa WAL y claves foráneas. `schema_migrations` registra versiones aplicadas. Cada migración se ejecuta en transacción y conserva datos históricos. Las migraciones 1–3 crean ajustes, catálogo y datos POS locales.

## Estrategia futura de sincronización

Cada entidad sincronizable tendrá UUID, `created_at`/`updated_at` UTC y movimientos auditables. Una edición en línea futura puede implementar una cola local idempotente y reintentos en un repositorio remoto, con resolución explícita de conflictos por negocio. La edición local no mostrará estados de sincronización ni enviará datos.

## Venta, caja y respaldos

La venta valida total y pagos, luego en una transacción SQLite exclusiva guarda ticket, partidas, pagos, movimientos de inventario y descuento de existencias. Relee precios y stock desde SQLite antes de confirmar. El POS exige caja abierta y bloquea el doble toque mientras guarda.

Los turnos de caja guardan fondo inicial, cobros por método, entradas, retiros, conteo final y diferencia. El efectivo esperado solo suma cobros en efectivo; tarjeta y transferencia no se mezclan con el cajón.

La copia manual usa la API de backup de SQLite para crear un snapshot consistente, lo cifra con AES-GCM y lo comparte con la hoja del sistema. La clave aleatoria de 256 bits queda en SecureStore y puede mostrarse para guardarla o transferirla por separado. Sin esa clave el archivo no se recupera. La restauración comprueba formato, autenticidad AES-GCM, `PRAGMA integrity_check` y versión; crea un snapshot local previo antes de reemplazar la base. Los respaldos no se envían automáticamente a la nube.

## Inventario, clientes, compras y acceso local

Las existencias reciben movimientos al crear/importar productos, vender, ajustar manualmente o registrar una compra. Los ajustes y compras actualizan el saldo en transacciones exclusivas.

La parte de una venta a crédito requiere cliente y queda en `sales.credit_cents`; los abonos se ligan al turno abierto y se suman a la conciliación por método. El límite configurado en cliente se valida dentro de la transacción de venta.

Las compras guardan proveedor opcional, referencia, partidas, costo y recepción inmediata. Los reportes consultan SQLite local y muestran cifras del día y saldos actuales.

El primer acceso requiere crear un administrador. Cada acceso posterior pide un PIN de 6–8 dígitos; su hash con sal se conserva en SQLite. Los perfiles restringen rutas en la app. No es identidad remota ni reemplaza controles de un servidor: los datos y la aplicación son locales.

Los tickets usan `expo-print` para abrir impresión del sistema Android/iOS/Web. La conexión a impresoras Bluetooth ESC/POS y el ajuste de papel/corte dependen del servicio y modelo de impresora; deben validarse con hardware real.

## Límites actuales

Descuentos, impuestos, cancelaciones/devoluciones, escáner, sincronización remota y cifrado SQLite en reposo siguen pendientes. La impresión necesita una impresora y servicio compatibles instalados; la conexión Bluetooth ESC/POS directa no está incluida. La clave de respaldo es transferible por decisión explícita del usuario y debe guardarse separada del archivo.
