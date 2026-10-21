# Plan y progreso

## Arquitectura y fases

1. Base Expo, navegación, SQLite y documentación.
2. Productos e inventario con movimientos auditables.
3. Venta atómica, pagos, tickets y caja.
4. Clientes, crédito, cotizaciones y apartados.
5. Compras, proveedores, gastos y reportes.
6. Respaldos, permisos y adaptadores para periféricos.
7. Estabilización Android y validación con hardware real.

## Sesión inicial

- Repositorio remoto vacío; carpeta local vacía al comenzar.
- Se generó plantilla Expo Router con SDK 58, React Native 0.88 y TypeScript estricto.
- Se añadió SQLite versión SDK-compatible, migración inicial y consulta local del resumen.
- Se cambió la identidad inicial a FerrePOS y se diseñó un dashboard con estado vacío sin datos de demostración.
- Se reemplazaron íconos genéricos de Expo con un ícono de tienda vectorial propio y sus variantes Android.
- Se añadió Jest 30 con preset compatible con Expo SDK 58 y 9 pruebas unitarias para parsear y presentar dinero en centavos.
- `npx expo lint`, `npx tsc --noEmit`, `npx expo-doctor` (20/20) y `npx expo export --platform android` pasaron.
- Build nativa Android debug exitosa (12:53 primera build; 1:01 y 13 s incrementales); instalada y abierta en dispositivo M2101K6R, con carga del dashboard. Se extrajo una copia de la DB local, se confirmó migración 1 y las tres tablas iniciales, y se verificó su persistencia al relanzar la app.
- `npm audit` reporta vulnerabilidades transitivas de la cadena Expo/Metro; el arreglo forzado sugerido baja Expo 14 versiones y no se aplicó.

## CRUD de productos

- Se agregó migración 2 para descripción, costo y SKU único sin distinguir mayúsculas, conservando productos existentes.
- Se implementó repositorio SQLite con alta, edición de datos comerciales, búsqueda, filtros, paginación y desactivación/reactivación lógica.
- Se añadió validación de formulario, precio positivo, cantidades con hasta tres decimales y existencia inicial solo al crear. El stock actual se reserva para movimientos de inventario.
- Se integró el catálogo al tab bar y al acceso rápido del dashboard.
- Pruebas unitarias, lint, TypeScript y compatibilidad de dependencias SDK pasan. La build nativa Android se instaló y el catálogo y formulario abrieron en el dispositivo; se confirmó migración 2 en SQLite.
