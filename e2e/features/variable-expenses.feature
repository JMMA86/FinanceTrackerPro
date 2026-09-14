Feature: Gastos Variables — Variable Expenses
  Como usuario autenticado de FinanceTrackerPro
  Quiero definir y monitorear mis gastos variables recurrentes
  Para comparar lo real con lo esperado mes a mes y controlar mis gastos no fijos

  # ============================================================================
  # Contexto de datos (seed: prisma/seed.e2e.ts)
  # ----------------------------------------------------------------------------
  # Dos usuarios aislados:
  #
  # 1) "Variable Expenses E2E User" (variable-expenses@e2e.financetrackerpro.com)
  #    - "Cuenta Corriente" (CHECKING, COP) con saldo de apertura ledger-backed
  #      (Rule 13) → permite registrar gastos reales desde la UI.
  #    - 4 definiciones monitorizadas (idempotencyKey determinista + categoría
  #      del sistema + objetivos mensuales):
  #        "Café"           10 veces / $8.000 c/u   (Restaurantes)  2/mes
  #        "Fútbol"          4 veces / $40.000 c/u  (Entretenimiento) 1/mes
  #        "Salidas Novia"   5 veces / $80.000 c/u  (Restaurantes)  1/mes
  #        "Mercado"         4 veces / $250.000 c/u (Mercado)       1/mes
  #      + transacciones EXPENSE de los últimos 6 meses (mes actual incluido)
  #      vinculadas a cada definición con su categoryId.
  #    - 2 plantillas de gasto fijo para la naturaleza "Fijo" de Nueva transacción:
  #        "Fijo Pendiente E2E" (ocurrencia del mes PENDIENTE → monto solo lectura)
  #        "Fijo Pagado E2E"    (ocurrencia del mes PAGADA  → "Adelantar...")
  #
  # 2) "Empty Variable Expenses E2E User" (variable-expenses-empty@e2e...)
  #    SIN definiciones → solo se usa en el escenario @empty.
  #
  # Los escenarios que mutan usan nombres/notas únicos con timestamp (ver
  # e2e/helpers/unique.ts) para que un retry de CI (que NO resetea la BD entre
  # intentos) nunca colisione con filas sobrantes. Las definiciones del seed son
  # solo lectura salvo "Café", que el escenario de registro incrementa.
  #
  # ORDEN: los escenarios de lectura del seed (@render, @detail) corren ANTES de
  # las mutaciones para que el estado compartido sea determinista.
  #
  # NOTA 1: no se usa Background porque playwright-bdd@8.5.1 tiene un bug donde
  # testInfo.line devuelve valores incorrectos en ejecución paralela. El login y
  # la navegación se repiten en cada escenario.
  #
  # NOTA 2: Next.js 16 puede servir un payload RSC obsoleto tras router.refresh()
  # (ver transactions.steps.ts). Los pasos que verifican una mutación reintentan
  # con un page.reload() completo si el estado fresco no aparece — una mutación
  # realmente fallida sigue fallando tras el reload.
  # ============================================================================

  # ============================================================================
  # EMPTY STATE (usuario dedicado sin definiciones)
  # ============================================================================

  @variable-expenses @empty @visual
  Scenario: La página sin definiciones muestra el empty state
    Given que el usuario sin definiciones variables ha iniciado sesión
    When navega a la página de gastos variables
    Then debe ver el título "Gastos Variables"
    And debe ver el mensaje de empty state "No tienes definiciones"
    And debe ver el botón "Nueva definición" en la página de gastos variables
    And el botón "Registrar gasto" de la página de gastos variables debe estar deshabilitado

  # ============================================================================
  # RENDER (tarjetas de resumen + definiciones del seed, solo lectura)
  # ============================================================================

  @variable-expenses @render @visual
  Scenario: La página renderiza las tarjetas de resumen y las definiciones del seed
    Given que el usuario de gastos variables ha iniciado sesión
    When navega a la página de gastos variables
    Then debe ver el título "Gastos Variables"
    And debe ver las tarjetas de resumen de gastos variables
    And la definición "Café" debe aparecer en la lista
    And la definición "Café" debe mostrar el resumen esperado vs real
    And la definición "Fútbol" debe mostrar su categoría "Entretenimiento"
    And la definición "Salidas Novia" debe mostrar su categoría "Restaurantes"

  # ============================================================================
  # CREAR DEFINICIÓN (nombre único → aparece en la lista con su categoría)
  # ============================================================================

  @variable-expenses @create @happy-path
  Scenario: Crear una definición de gasto variable la muestra en la lista con su categoría
    Given que el usuario de gastos variables ha iniciado sesión
    When navega a la página de gastos variables
    And abre el modal de creación de definición variable
    And ingresa un nombre único de definición variable con prefijo "Definición E2E"
    And selecciona la categoría de la definición "Entretenimiento"
    And ingresa "3" veces por mes como objetivo de la definición
    And ingresa "1500000" como monto esperado de la definición
    And envía el formulario de creación de definición variable
    Then la definición con el nombre único debe aparecer en la lista con la categoría "Entretenimiento"

  # ============================================================================
  # DETALLE (filtros de gasto variable y de mes, tendencia y scroll)
  # ============================================================================

  @variable-expenses @detail @visual
  Scenario: El detalle filtra por definición y por mes, y muestra la tendencia
    Given que el usuario de gastos variables ha iniciado sesión
    When navega a la página de gastos variables
    And abre el detalle de la definición "Café"
    Then el detalle debe mostrar la tendencia de la definición "Café"
    When filtra el detalle por la definición "Todos los gastos variables"
    Then el detalle no debe mostrar la tendencia
    And el detalle debe listar movimientos de todas las definiciones
    When filtra los movimientos del detalle por "Todos los movimientos"
    Then la lista de movimientos del detalle debe ser desplazable

  # ============================================================================
  # REGISTRAR GASTO (aumenta el conteo del mes y queda asociado a la definición)
  # ============================================================================

  @variable-expenses @register @happy-path
  Scenario: Registrar un gasto aumenta el conteo del mes y queda asociado a la definición
    Given que el usuario de gastos variables ha iniciado sesión
    And guarda el conteo del mes de la definición "Café" como "cafe"
    When navega a la página de gastos variables
    And abre el registro de gasto para la definición "Café"
    And registra un gasto variable con nota única "Gasto variable E2E" y monto "1234500"
    Then el diálogo debe estar cerrado
    And el conteo del mes de la definición "Café" debe haber aumentado respecto a "cafe"
    When abre el detalle de la definición "Café"
    Then el detalle debe incluir la nota única del gasto variable

  # ============================================================================
  # NUEVA TRANSACCIÓN · VARIABLE (sin categoría, elige definición, se refleja)
  # ============================================================================

  @variable-expenses @transaction @variable @happy-path
  Scenario: Nueva transacción con naturaleza Variable no pide categoría y se refleja
    Given que el usuario de gastos variables ha iniciado sesión
    When navega a la página de transacciones
    And abre el modal de nueva transacción
    And selecciona la naturaleza de gasto "Variable"
    Then el campo categoría no debe estar visible en el formulario de transacción
    And debe ver el selector de gasto variable en el formulario de transacción
    When selecciona la definición variable "Café" en el formulario de transacción
    And ingresa "1234500" en el campo valor de la transacción
    And ingresa una descripción única de transacción variable con prefijo "Variable E2E"
    And envía el formulario de transacción variable
    Then el diálogo debe estar cerrado
    When navega a la página de gastos variables
    And abre el detalle de la definición "Café"
    Then el detalle debe incluir la descripción única de transacción variable

  # ============================================================================
  # NUEVA TRANSACCIÓN · FIJO (monto automático y opción de adelantar)
  # ============================================================================

  @variable-expenses @transaction @fixed @happy-path
  Scenario: Nueva transacción con naturaleza Fijo usa el monto automático del gasto fijo
    Given que el usuario de gastos variables ha iniciado sesión
    When navega a la página de transacciones
    And abre el modal de nueva transacción
    And selecciona la naturaleza de gasto "Fijo"
    Then el campo categoría no debe estar visible en el formulario de transacción
    When selecciona el gasto fijo "Fijo Pendiente E2E" en el formulario de transacción
    Then debe ver el monto automático del gasto fijo
    And el campo valor de la transacción no debe estar visible
    When selecciona el gasto fijo "Fijo Pagado E2E" en el formulario de transacción
    Then debe ver la opción de adelantar el próximo mes

  # ============================================================================
  # LOCALIZACIÓN EN INGLÉS
  # ============================================================================

  @variable-expenses @i18n
  Scenario: La página de gastos variables renderiza en inglés
    Given que el usuario de gastos variables ha iniciado sesión
    When navega a la página de gastos variables en inglés
    Then debe ver el título "Variable Expenses"
    And debe ver el botón "New definition" en la página de gastos variables
    And debe ver las tarjetas de resumen de gastos variables en inglés
