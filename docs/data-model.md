# Modelo de datos

La migración 1 define:

- `schema_migrations(version, applied_at)`: control secuencial del esquema.
- `business_settings`: fila única con nombre provisional y moneda MXN.
- `products`: SKU opcional único, nombre, precio en centavos, existencias y mínimo, estado lógico y marcas de tiempo. Los checks rechazan importes y existencias negativos.

La migración 2 agrega descripción y costo en centavos. También normaliza las claves vacías como `NULL` y crea un índice único de SKU que ignora mayúsculas/minúsculas. La interfaz normaliza las claves nuevas a mayúsculas.

El catálogo incluye búsqueda por nombre, SKU y descripción, filtros por estado y paginación. Crear permite registrar existencias iniciales; la edición no cambia existencias. El borrado es lógico: los productos se desactivan y pueden reactivarse, preservando su historial. El dashboard cuenta productos activos bajo el mínimo.

El stock actual se actualiza en transacciones y se mantiene un Kardex para ventas, compras, ajustes manuales y existencias iniciales.

La migración 3 agrega `cash_sessions`, `cash_movements`, `sales`, `sale_items`, `payments` e `inventory_movements`. Un turno abierto es único por base de datos. Una venta guarda snapshots de nombre, SKU, costo y precio, sus métodos de pago y movimientos de inventario; descontar existencias y completar la venta ocurre en una transacción exclusiva. Los productos no se borran físicamente porque el historial de venta los referencia.

El efectivo esperado al corte es fondo inicial + cobros en efectivo + entradas − retiros. Tarjeta y transferencia se reportan aparte. El efectivo aplicado a una venta ya es neto del cambio entregado, por eso el cambio no se vuelve a restar en el cálculo del cajón. No se permiten retiros superiores al efectivo esperado. El corte guarda efectivo contado y diferencia firmada.

El flujo de venta admite crédito por cliente, pero todavía no incluye descuentos, impuestos, cancelaciones ni devoluciones. El total de línea se redondea a centavos desde precio unitario × cantidad; las cantidades fraccionarias son posibles en el esquema, aunque el POS actual vende unidades enteras.

Los identificadores de sincronización son UUID, no autoincrementales. Categorías, unidades, devoluciones y sincronización remota continúan pendientes.

La migración 4 añade clientes y límite de crédito; `sales.customer_id` y `sales.credit_cents` representan el cargo a cuenta. `credit_payments` guarda abonos por cliente, método, turno de caja y usuario; el saldo se calcula como crédito de ventas completadas menos abonos. Los abonos cuentan en cobros por método y efectivo esperado.

La misma migración añade proveedores, compras y partidas. Registrar una compra y recibir existencias ocurre en una transacción; actualiza stock y costo actual e inserta un movimiento `purchase` con referencia al documento. `inventory_movements` conserva ajustes, ventas y compras junto con el usuario que los registró.

`app_users` almacena nombre, perfil local y hash SHA-256 salado del PIN. Los perfiles administrador, encargado y cajero controlan las rutas accesibles; la aplicación requiere crear el primer administrador y pide PIN al abrir una sesión nueva. El modelo es local y no sincroniza usuarios.
