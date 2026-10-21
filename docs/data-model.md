# Modelo de datos inicial

La migración 1 define:

- `schema_migrations(version, applied_at)`: control secuencial del esquema.
- `business_settings`: fila única con nombre provisional y moneda MXN.
- `products`: SKU opcional único, nombre, precio en centavos, existencias y mínimo, estado lógico y marcas de tiempo. Los checks rechazan importes y existencias negativos.

El catálogo inicial está vacío. El dashboard cuenta productos activos bajo el mínimo. Todavía no se mantiene un Kardex ni se deriva stock de movimientos; cuando se implemente inventario, los movimientos serán la fuente auditable y sus saldos se actualizarán en transacciones.

Futuras migraciones añadirán categorías, códigos de barras, unidades y conversiones; después clientes, ventas, partidas, pagos, devoluciones, caja y bitácora. Las ventas guardarán snapshots de nombres, precio, costo e impuestos para preservar el historial. Los identificadores de sincronización serán UUID, no autoincrementales.
