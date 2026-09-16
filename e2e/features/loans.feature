Feature: Préstamos — Loans
  Como usuario autenticado de FinanceTrackerPro
  Quiero gestionar mis préstamos por cobrar y por pagar
  Para controlar cuotas, intereses y saldos de cada préstamo.

  # ============================================================================
  # Contexto de datos (seed: prisma/seed.e2e.ts)
  # ----------------------------------------------------------------------------
  # Dos usuarios aislados:
  #
  # 1) "Empty Loans E2E User" (loans-empty@e2e.financetrackerpro.com)
  #    SIN préstamos y SIN cuentas → solo se usa en el escenario @empty.
  #
  # 2) "Loans E2E User" (loans@e2e.financetrackerpro.com)
  #    - "Bancolombia (Ahorros)" (SAVINGS, COP) saldo respaldado por el ledger.
  #    - "Efectivo" (CASH, COP) saldo deliberadamente pequeño ($50.000) para
  #      probar el guard "el monto supera el saldo disponible".
  #    - Préstamo RECEIVABLE "Préstamo E2E a Diego" ($3.000.000, 24% EA, 12
  #      cuotas) con las cuotas #1 y #2 PAGADAS; #2 cae en el mes actual, así
  #      que el modal de transacciones muestra "La cuota de este mes ya fue pagada".
  #    - Préstamo PAYABLE "Crédito E2E Banco" ($5.000.000, 18% EA, 24 cuotas)
  #      con la cuota #1 PAGADA y la #2 VENCIDA.
  #
  # Los escenarios que mutan (crear préstamo) usan un nombre único con timestamp
  # (helpers/unique.ts) para que un retry de CI (que NO resetea la BD) nunca
  # colisione con filas sobrantes. Los préstamos del seed son SOLO lectura.
  #
  # ORDEN: las lecturas del seed (listado, detalle, transacciones) pueden
  # ejecutarse en paralelo con los escenarios de creación; las aserciones del
  # listado se hacen por tarjeta y no por conteo total para no acoplarse a las
  # tarjetas nuevas.
  #
  # NOTA: no se usa Background porque playwright-bdd@8.5.1 tiene un bug donde
  # testInfo.line devuelve valores incorrectos en ejecución paralela (2 workers).
  # Los pasos de login + navegación se repiten en cada escenario.
  # ============================================================================

  # ============================================================================
  # EMPTY STATE (usuario dedicado sin préstamos)
  # ============================================================================

  @loans @empty
  Scenario: La página de préstamos vacía muestra el estado inicial
    Given que el usuario sin préstamos ha iniciado sesión
    When navega a la página de préstamos
    Then debe ver el título de sección "Préstamos"
    And debe ver el mensaje de empty state "No tienes préstamos registrados"
    And debe ver el botón "Nuevo préstamo" en el empty state

  # ============================================================================
  # LISTADO (tarjetas del seed, insignias y resumen por moneda)
  # ============================================================================

  @loans @list
  Scenario: El listado muestra las tarjetas, las insignias y el resumen por moneda
    Given que el usuario de préstamos ha iniciado sesión
    When navega a la página de préstamos
    Then la tarjeta de préstamo "Préstamo E2E a Diego" debe ser visible
    And la tarjeta de préstamo "Crédito E2E Banco" debe ser visible
    And la tarjeta de préstamo "Préstamo E2E a Diego" debe mostrar la insignia "Por cobrar"
    And la tarjeta de préstamo "Crédito E2E Banco" debe mostrar la insignia "Por pagar"
    And el resumen de préstamos debe mostrar la etiqueta "Por cobrar"
    And el resumen de préstamos debe mostrar la etiqueta "Por pagar"
    And el resumen de préstamos debe mostrar la etiqueta "Capital total"
    And el resumen de préstamos debe mostrar la etiqueta "Interés total"
    And el resumen de préstamos debe mostrar la etiqueta "Cuota del mes"

  # ============================================================================
  # DETALLE EN MODAL (ojito → tabla de amortización, sin cambiar la URL)
  # ============================================================================

  @loans @detail
  Scenario: El detalle abre en un modal con la tabla de amortización
    Given que el usuario de préstamos ha iniciado sesión
    When navega a la página de préstamos
    And abre el detalle del préstamo "Préstamo E2E a Diego"
    Then el modal de detalle del préstamo debe estar visible con el título "Préstamo E2E a Diego"
    And la URL debe seguir siendo la página de préstamos
    And la tabla de amortización debe mostrar la columna "#"
    And la tabla de amortización debe mostrar la columna "Fecha"
    And la tabla de amortización debe mostrar la columna "Cuota"
    And la tabla de amortización debe mostrar la columna "Interés"
    And la tabla de amortización debe mostrar la columna "Capital"
    And la tabla de amortización debe mostrar la columna "Saldo"
    And la tabla de amortización debe mostrar la columna "Estado"
    When presiona Escape
    Then el modal de detalle del préstamo debe cerrarse

  # ============================================================================
  # CREAR PRÉSTAMO - MODO TERM (nombre único → tarjeta visible)
  # ============================================================================

  @loans @create @term
  Scenario: Crear un préstamo por número de cuotas (TERM)
    Given que el usuario de préstamos ha iniciado sesión
    When navega a la página de préstamos
    And abre el modal de creación de préstamo
    And ingresa un nombre único de préstamo con prefijo "Préstamo TERM E2E"
    And ingresa "100000" en el monto principal del préstamo
    And ingresa "2400" en la tasa de interés del préstamo
    And ingresa "12" en el número de cuotas del préstamo
    And envía el formulario de creación de préstamo
    Then la tarjeta de préstamo con el nombre único debe ser visible

  # ============================================================================
  # CREAR PRÉSTAMO - MODO INSTALLMENT (valor de cuota → nº de cuotas calculado)
  # ============================================================================

  @loans @create @installment
  Scenario: Crear un préstamo por valor de cuota (INSTALLMENT)
    Given que el usuario de préstamos ha iniciado sesión
    When navega a la página de préstamos
    And abre el modal de creación de préstamo
    And ingresa un nombre único de préstamo con prefijo "Préstamo Cuota E2E"
    And ingresa "100000" en el monto principal del préstamo
    And ingresa "2400" en la tasa de interés del préstamo
    And selecciona el modo de programación "Por valor de cuota"
    And ingresa "10000" en el valor de la cuota
    Then debe ver la etiqueta "Número de cuotas calculado" en la vista previa del préstamo
    When envía el formulario de creación de préstamo
    Then la tarjeta de préstamo con el nombre único debe ser visible

  # ============================================================================
  # VALIDACIONES (botón deshabilitado, saldo, cuota > total)
  # ============================================================================

  @loans @validation
  Scenario: El botón de crear permanece deshabilitado hasta completar los campos
    Given que el usuario de préstamos ha iniciado sesión
    When navega a la página de préstamos
    And abre el modal de creación de préstamo
    Then el botón de crear préstamo debe estar deshabilitado
    When ingresa un nombre único de préstamo con prefijo "Préstamo Validación E2E"
    And ingresa "100000" en el monto principal del préstamo
    And ingresa "2400" en la tasa de interés del préstamo
    Then el botón de crear préstamo debe estar habilitado
    When presiona Escape
    Then el modal de creación de préstamo debe cerrarse

  @loans @validation
  Scenario: El monto no puede superar el saldo de la cuenta seleccionada
    Given que el usuario de préstamos ha iniciado sesión
    When navega a la página de préstamos
    And abre el modal de creación de préstamo
    And ingresa un nombre único de préstamo con prefijo "Préstamo Saldo E2E"
    And ingresa "99999999" en el monto principal del préstamo
    And ingresa "2400" en la tasa de interés del préstamo
    And selecciona la cuenta "Efectivo" en el formulario de préstamo
    Then debe ver el error de préstamo "El monto supera el saldo disponible en la cuenta seleccionada"
    When presiona Escape
    Then el modal de creación de préstamo debe cerrarse

  @loans @validation
  Scenario: La cuota no puede superar el total a pagar con intereses
    Given que el usuario de préstamos ha iniciado sesión
    When navega a la página de préstamos
    And abre el modal de creación de préstamo
    And ingresa un nombre único de préstamo con prefijo "Préstamo Cuota Alta E2E"
    And ingresa "100000" en el monto principal del préstamo
    And ingresa "2400" en la tasa de interés del préstamo
    And selecciona el modo de programación "Por valor de cuota"
    And ingresa "99999999" en el valor de la cuota
    Then debe ver el error de préstamo "La cuota no puede ser mayor que el total a pagar con intereses"
    When presiona Escape
    Then el modal de creación de préstamo debe cerrarse

  # ============================================================================
  # TRANSACCIONES → NATURALEZA PRÉSTAMO (selector de préstamos + estado de cuota)
  # ============================================================================

  @loans @transactions
  Scenario: La naturaleza Préstamo lista préstamos y muestra el estado de la cuota
    Given que el usuario de préstamos ha iniciado sesión
    When navega a la página de transacciones
    And abre el modal de nueva transacción
    And selecciona la naturaleza de gasto "Préstamo"
    Then el selector de préstamo debe listar el préstamo "Crédito E2E Banco" y no cuotas
    When selecciona el préstamo "Crédito E2E Banco" en el formulario de transacción
    Then debe ver el estado de cuota "Cuota vencida"
    And debe ver las acciones de préstamo "Pagar cuota" y "Abonar a capital"
    When selecciona el tipo de transacción "Ingreso"
    And selecciona el préstamo "Préstamo E2E a Diego" en el formulario de transacción
    Then debe ver el estado de cuota "La cuota de este mes ya fue pagada"
    When presiona Escape
    Then el modal de transacción debe cerrarse

  # ============================================================================
  # LOCALIZACIÓN EN INGLÉS
  # ============================================================================

  @loans @i18n
  Scenario: La página de préstamos se renderiza en inglés
    Given que el usuario de préstamos ha iniciado sesión
    When navega a la página de préstamos en inglés
    Then debe ver el título de sección "Loans"
    And debe ver el botón "New Loan" en la página de préstamos
    And el resumen de préstamos debe mostrar la etiqueta "Receivable"
    And el resumen de préstamos debe mostrar la etiqueta "Payable"
