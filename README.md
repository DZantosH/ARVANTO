# FerrePOS

Punto de venta local para ferreterías y tlapalerías en México. La aplicación guarda los datos en SQLite en el dispositivo y puede operar sin conexión.

## Requisitos y ejecución

- Node.js compatible con Expo SDK 58 (se desarrolló con Node 26.12.0).
- Android Studio/Android SDK o un dispositivo Android. Los flujos con módulos nativos se validan en development build.

```bash
npm install
npx expo start
```

Para probar en Android con emulador, inicia el emulador y ejecuta `npm run android`.

## Estado

- Base local y dashboard conectado a SQLite.
- Productos: alta, búsqueda, edición, filtro y desactivación lógica.
- Catálogo: importación de Excel (XLS/XLSX), PDF (incluidos escaneados) y fotos PNG/JPG, con vista previa, edición, validación y detección de claves duplicadas antes de guardar.
- Venta: carrito, pagos en efectivo/tarjeta/transferencia, cambio, ticket y descuento de stock atómico.
- Caja: apertura, entradas/retiros, corte y diferencia por turno.
- Respaldos: exportación cifrada y restauración validada.
- Interfaz: paleta naranja y grafito, listas planas, controles rectangulares y contenido con ancho máximo en pantallas grandes.

No se carga información de demostración. La primera venta requiere productos registrados y un turno de caja abierto.

La lectura de PDF, la conversión local de páginas PDF y el OCR de imágenes se ejecutan en el dispositivo y requieren abrir la app en una development build (`npm run android` o una build EAS); no están disponibles en Expo Go. La importación de hojas Excel funciona también en Expo Go. Los PDF se limitan a 20 páginas por importación.

El respaldo usa una clave aleatoria de 256 bits almacenada en SecureStore. Muéstrala en la pantalla Respaldos y guárdala aparte del archivo para recuperar copias en otro dispositivo. Si se pierde, el respaldo cifrado no se puede descifrar.

## Comprobaciones

```bash
npx expo lint
npx tsc --noEmit
npm test
npx expo-doctor
```

Consulta [docs/testing.md](docs/testing.md) para los resultados y limitaciones del entorno.

## Documentación

- [Arquitectura](docs/architecture.md)
- [Modelo de datos inicial](docs/data-model.md)
- [Decisiones técnicas](docs/decisions.md)
- [Plan y progreso](docs/progress.md)

La aplicación no necesita internet para vender, operar caja o consultar la base local. Quedan pendientes clientes/crédito, impuestos y descuentos, cancelaciones/devoluciones, impresión física, escáner, sincronización y licencia.
