# Modelo de datos

La migración 1 define:

- `schema_migrations(version, applied_at)`: control secuencial del esquema.
- `business_settings`: fila única con nombre provisional y moneda MXN.
- `products`: SKU opcional único, nombre, precio en centavos, existencias y mínimo, estado lógico y marcas de tiempo. Los checks rechazan importes y existencias negativos.

La migración 2 agrega descripción y costo en centavos. También normaliza las claves vacías como `NULL` y crea un índice único de SKU que ignora mayúsculas/minúsculas. La interfaz normaliza las claves nuevas a mayúsculas.

El catálogo incluye búsqueda por nombre, SKU y descripción, filtros por estado y paginación. Crear permite registrar existencias iniciales; la edición no cambia existencias. El borrado es lógico: los productos se desactivan y pueden reactivarse, preservando su historial. El dashboard cuenta productos activos bajo el mínimo.

Todavía no se mantiene un Kardex ni se deriva stock de movimientos; cuando se implemente inventario, los movimientos serán la fuente auditable y sus saldos se actualizarán en transacciones.

La migración 3 agrega `cash_sessions`, `cash_movements`, `sales`, `sale_items`, `payments` e `inventory_movements`. Un turno abierto es único por base de datos. Una venta guarda snapshots de nombre, SKU, costo y precio, sus métodos de pago y movimientos de inventario; descontar existencias y completar la venta ocurre en una transacción exclusiva. Los productos no se borran físicamente porque el historial de venta los referencia.

El efectivo esperado al corte es fondo inicial + cobros en efectivo + entradas − retiros. Tarjeta y transferencia se reportan aparte. El efectivo aplicado a una venta ya es neto del cambio entregado, por eso el cambio no se vuelve a restar en el cálculo del cajón. No se permiten retiros superiores al efectivo esperado. El corte guarda efectivo contado y diferencia firmada.

El MVP de venta no incluye descuentos, impuestos, clientes, crédito, cancelaciones ni devoluciones. El total de línea se redondea a centavos desde precio unitario × cantidad; las cantidades fraccionarias son posibles en el esquema, aunque el flujo actual vende unidades enteras.

Futuras migraciones añadirán categorías, códigos de barras, unidades, conversiones, clientes, crédito, devoluciones y bitácora. Los identificadores de sincronización son UUID, no autoincrementales.
