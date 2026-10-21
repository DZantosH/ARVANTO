# Modelo de datos

La migración 1 define:

- `schema_migrations(version, applied_at)`: control secuencial del esquema.
- `business_settings`: fila única con nombre provisional y moneda MXN.
- `products`: SKU opcional único, nombre, precio en centavos, existencias y mínimo, estado lógico y marcas de tiempo. Los checks rechazan importes y existencias negativos.

La migración 2 agrega descripción y costo en centavos. También normaliza las claves vacías como `NULL` y crea un índice único de SKU que ignora mayúsculas/minúsculas. La interfaz normaliza las claves nuevas a mayúsculas.

El catálogo incluye búsqueda por nombre, SKU y descripción, filtros por estado y paginación. Crear permite registrar existencias iniciales; la edición no cambia existencias. El borrado es lógico: los productos se desactivan y pueden reactivarse, preservando su historial. El dashboard cuenta productos activos bajo el mínimo.

Todavía no se mantiene un Kardex ni se deriva stock de movimientos; cuando se implemente inventario, los movimientos serán la fuente auditable y sus saldos se actualizarán en transacciones.

Futuras migraciones añadirán categorías, códigos de barras, unidades y conversiones; después clientes, ventas, partidas, pagos, devoluciones, caja y bitácora. Las ventas guardarán snapshots de nombres, precio, costo e impuestos para preservar el historial. Los identificadores de sincronización serán UUID, no autoincrementales.
