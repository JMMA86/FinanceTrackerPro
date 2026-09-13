Feature: Gastos Fijos — Fixed Expenses
  Como usuario autenticado de FinanceTrackerPro
  Quiero gestionar mis gastos recurrentes y sus pagos
  Para proyectar mis vencimientos y mantener mis finanzas al día

  # ============================================================================
  # Contexto de datos (seed: prisma/seed.e2e.ts)
  # ----------------------------------------------------------------------------
  # Dos usuarios aislados:
  #
  # 1) "Fixed Expenses E2E User" (fixed-expenses@e2e.financetrackerpro.com)
  #    - "Cuenta Corriente" (CHECKING, COP) balanceCents = 50.000.000 ($500.000)
  #      con transacción INCOME de apertura → saldo "verdadero" reconciliable.
  #    - 4 plantillas MENSUALES cuyas ocurrencias empiezan el MES ACTUAL (para que
  #      la ventana de 3 meses de mora no materialice ocurrencias antiguas):
  #        "Arriendo E2E"  día 5  $1.200.000  → ocurrencia del mes PAGADA  = "Pagado"
  #        "Internet E2E"  día 31 $  120.000  → ocurrencia del mes sin pagar = "Pendiente"
  #        "Gimnasio E2E"  día 1  $   80.000  → ocurrencia del mes sin pagar = "Vencido"
  #        "Netflix E2E"   día 1  $   45.000  → ocurrencia del mes sin pagar = "Vencido"
  #                                              (la paga el escenario de pago → "Pagado")
  #
  # 2) "Empty Fixed Expenses E2E User" (fixed-expenses-empty@...)
  #    SIN gastos fijos → solo se usa en el escenario @empty.
  #
  # Los escenarios que mutan usan nombres únicos con timestamp (ver
  # e2e/helpers/unique.ts) para que un retry de CI (que NO resetea la BD entre
  # intentos) nunca colisione con filas sobrantes. Las plantillas del seed son
  # solo lectura salvo "Netflix E2E", que el escenario de pago deja "Pagado".
  #
  # ORDEN: los escenarios de lectura del seed (@render, @calendar, @horizon)
  # corren ANTES de las mutaciones para que el estado compartido sea determinista.
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
  # EMPTY STATE (usuario dedicado sin gastos)
  # ============================================================================

  @fixed-expenses @empty @visual
  Scenario: Empty fixed expenses page shows create prompt
    Given que el usuario sin gastos fijos ha iniciado sesión
    When navega a la página de gastos fijos
    Then debe ver el título de sección "Gastos Fijos"
    And debe ver el mensaje de empty state "No tienes gastos fijos"
    And debe ver el botón "Nuevo Gasto Fijo" en el empty state

  # ============================================================================
  # RENDER (summary cards + plantillas del seed, solo lectura)
  # ============================================================================

  @fixed-expenses @render @visual
  Scenario: Fixed expenses page renders summary cards and seeded templates
    Given que el usuario de gastos fijos ha iniciado sesión
    When navega a la página de gastos fijos
    Then debe ver las tarjetas de resumen de gastos fijos
    And debe ver la tarjeta de gasto fijo "Arriendo E2E" con estado "Pagado"
    And debe ver la tarjeta de gasto fijo "Gimnasio E2E" con estado "Vencido"
    And debe ver la tarjeta de gasto fijo "Internet E2E" con estado "Pendiente"
    And debe ver la tarjeta de gasto fijo "Netflix E2E"

  # ============================================================================
  # CALENDARIO (clic en un día con pagos → mini modal)
  # ============================================================================

  @fixed-expenses @calendar @visual
  Scenario: Calendar view opens a day modal with the scheduled payments
    Given que el usuario de gastos fijos ha iniciado sesión
    When navega a la página de gastos fijos
    And cambia a la vista de calendario
    And hace clic en el primer día del calendario con pagos
    Then debe ver el modal del día con los pagos programados

  # ============================================================================
  # SELECTOR DE HORIZONTE (Semana / Mes / Trimestre)
  # ============================================================================

  @fixed-expenses @horizon @visual
  Scenario: Upcoming payments horizon selector filters the list
    Given que el usuario de gastos fijos ha iniciado sesión
    When navega a la página de gastos fijos
    And selecciona el horizonte de próximos pagos "Próxima semana"
    And guarda la cantidad de próximos pagos como "week"
    And selecciona el horizonte de próximos pagos "Próximo mes"
    And guarda la cantidad de próximos pagos como "month"
    And selecciona el horizonte de próximos pagos "Próximo trimestre"
    And guarda la cantidad de próximos pagos como "quarter"
    Then la cantidad de próximos pagos de "month" debe ser mayor que la de "week"
    And la cantidad de próximos pagos de "quarter" debe ser mayor que la de "month"

  # ============================================================================
  # CREAR GASTO FIJO - FLUJO EXITOSO (nombre único → tarjeta visible)
  # ============================================================================

  @fixed-expenses @create @happy-path
  Scenario: Create a fixed expense shows a new card with its next payment
    Given que el usuario de gastos fijos ha iniciado sesión
    When navega a la página de gastos fijos
    And abre el modal de creación de gasto fijo
    And ingresa un nombre único de gasto fijo con prefijo "Gasto E2E"
    And ingresa "3000000" en el monto del gasto fijo
    And envía el formulario de creación de gasto fijo
    Then la tarjeta de gasto fijo con el nombre único debe ser visible
    And la tarjeta de gasto fijo con el nombre único debe mostrar el próximo pago

  # ============================================================================
  # PAGAR GASTO FIJO DEL SEED (badge "Pagado" + saldo de la cuenta reducido)
  # ============================================================================

  @fixed-expenses @pay @happy-path
  Scenario: Pay a seeded fixed expense marks it paid and reduces the account balance
    Given que el usuario de gastos fijos ha iniciado sesión
    And guarda el saldo actual de la cuenta de gastos fijos
    When navega a la página de gastos fijos
    And paga el gasto fijo "Netflix E2E" con la cuenta por defecto
    Then debe ver la tarjeta de gasto fijo "Netflix E2E" con estado "Pagado"
    And el saldo de la cuenta de gastos fijos debe haberse reducido en 4500000

  # ============================================================================
  # PAGOS RECIENTES (sin pagos → tras pagar, exactamente una fila con hoy)
  # ============================================================================

  @fixed-expenses @recent-payments @happy-path
  Scenario: Recent payments shows exactly the paid date after a payment
    Given que el usuario de gastos fijos ha iniciado sesión
    When navega a la página de gastos fijos
    And abre el modal de creación de gasto fijo
    And ingresa un nombre único de gasto fijo con prefijo "Gasto Reciente E2E"
    And ingresa "3000000" en el monto del gasto fijo
    And envía el formulario de creación de gasto fijo
    Then la tarjeta de gasto fijo con el nombre único debe ser visible
    And la tarjeta de gasto fijo con el nombre único no debe mostrar "Pagos recientes"
    When paga la tarjeta de gasto fijo con el nombre único
    Then la tarjeta de gasto fijo con el nombre único debe mostrar exactamente 1 pago reciente
    And el pago reciente debe corresponder a la fecha de hoy

  # ============================================================================
  # CREAR - VALIDACIÓN (nombre requerido y fecha de fin anterior al inicio)
  # ============================================================================

  @fixed-expenses @create @validation
  Scenario: Create fixed expense validates the required name
    Given que el usuario de gastos fijos ha iniciado sesión
    When navega a la página de gastos fijos
    And abre el modal de creación de gasto fijo
    And ingresa "500000" en el monto del gasto fijo
    And envía el formulario de creación de gasto fijo
    Then el campo nombre del gasto fijo debe estar marcado como inválido
    When presiona Escape
    Then el modal de creación de gasto fijo debe cerrarse

  @fixed-expenses @create @validation
  Scenario: Create fixed expense rejects an end date before the start date
    Given que el usuario de gastos fijos ha iniciado sesión
    When navega a la página de gastos fijos
    And abre el modal de creación de gasto fijo
    And ingresa un nombre único de gasto fijo con prefijo "Gasto Fecha E2E"
    And ingresa "500000" en el monto del gasto fijo
    And selecciona una fecha de fin anterior a la fecha de inicio
    And envía el formulario de creación de gasto fijo
    Then el campo fecha de fin debe estar marcado como inválido
    When presiona Escape
    Then el modal de creación de gasto fijo debe cerrarse

  # ============================================================================
  # LOCALIZACIÓN EN INGLÉS
  # ============================================================================

  @fixed-expenses @i18n
  Scenario: Fixed expenses page renders in English
    Given que el usuario de gastos fijos ha iniciado sesión
    When navega a la página de gastos fijos en inglés
    Then debe ver el título de sección "Fixed Expenses"
    And debe ver el botón "New Fixed Expense" en la página de gastos fijos
    And debe ver las tarjetas de resumen en inglés
