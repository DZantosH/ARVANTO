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
