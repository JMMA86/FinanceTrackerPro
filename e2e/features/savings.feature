Feature: Gestión de Metas de Ahorro — Savings Goals
  Como usuario autenticado de FinanceTrackerPro
  Quiero gestionar mis metas de ahorro
  Para ahorrar con propósito y seguir mi progreso

  # ============================================================================
  # Contexto de datos (seed: prisma/seed.e2e.ts)
  # ----------------------------------------------------------------------------
  # Dos usuarios aislados:
  #
  # 1) "Empty Savings E2E User" (savings-empty@e2e.financetrackerpro.com)
  #    SIN metas y SIN cuentas → solo se usa en el escenario @empty. Nunca
  #    reutiliza el usuario de auth (el escenario viejo acoplaba features).
  #
  # 2) "Savings E2E User" (savings@e2e.financetrackerpro.com)
  #    - "Cuenta Corriente" (CHECKING, COP) balanceCents = 10.000.000 ($100.000)
  #      con transacción INCOME de apertura → saldo "verdadero" reconciliable.
  #    - "Cuenta de Ahorros" (SAVINGS, COP)  balanceCents =  5.000.000
  #      SIN transacción de apertura → su saldo verdadero es 0 (nunca usar de origen).
  #    - 5 metas:
  #        "Fondo de Emergencia" target 2.000.000, current 0, monthly 200.000
  #        "Pequeña Meta"        target    50.000, current 40.000 (80%), monthly 10.000
  #                              + contribución real de 40.000 (Rule 13 backing)
  #        "Meta Original"       target   100.000, current 0            (editable)
  #        "Meta Eliminable"     target    75.000, current 0            (sin contribuciones)
  #        "Meta Completada"     target   100.000, current 100.000 COMPLETED
  #                              + contribución real de 100.000 (Rule 13 backing)
  #
  # Los escenarios mutan SOLO a través de la UI (Server Actions). Las mutaciones
  # usan metas creadas con nombre único (timestamp) para que un retry de CI
  # (que NO resetea la BD entre intentos) nunca colisione con filas sobrantes.
  # Las metas del seed son SOLO lectura (summary, spendable, badge, warnings).
  #
  # ORDEN: los escenarios de lectura del seed (summary, spendable, badge)
  # corren ANTES de las mutaciones. El overdraft ("Disponible para Gastar" rojo)
  # se calcula con ingresos del MES actual = 0 (la apertura es de 2026-01-01) y
  # compromisos de ahorro = 210.000 (Fondo 200.000 + Pequeña 10.000) → siempre
  # negativo mientras no se borren ambas metas, así que el orden es seguro.
  #
  # NOTA: no se usa Background porque playwright-bdd@8.5.1 tiene un bug donde
  # testInfo.line devuelve valores incorrectos en ejecución paralela (2 workers).
  # Los pasos de login + navegación se repiten en cada escenario.
  # ============================================================================

  # ============================================================================
  # EMPTY STATE (usuario dedicado sin metas)
  # ============================================================================

  @savings @empty @visual
  Scenario: Empty savings page shows create prompt
    Given que el usuario sin metas de ahorro ha iniciado sesión
    When navega a la página de ahorros
    Then debe ver el título de sección "Ahorros"
    And debe ver el mensaje de empty state "No tienes metas de ahorro"
    And debe ver el botón "Nueva Meta" en el empty state

  # ============================================================================
  # SUMMARY CARDS (seed del usuario de ahorros, solo lectura)
  # ============================================================================

  @savings @summary @visual
  Scenario: Summary cards display correctly with active and completed goals
    Given que el usuario de ahorros ha iniciado sesión
    When navega a la página de ahorros
    Then debe ver la tarjeta "Total Ahorrado"
    And debe ver la tarjeta "Meta Total"
    And debe ver la tarjeta "Progreso General"
    And debe ver la tarjeta "Disponible para Gastar"

  # ============================================================================
  # MAX SPENDABLE CARD (desglose + sobregiro en rojo con warning)
  # ============================================================================

  @savings @spendable @visual
  Scenario: Max spendable card displays breakdown
    Given que el usuario de ahorros ha iniciado sesión
    When navega a la página de ahorros
    Then debe ver la tarjeta "Disponible para Gastar" con desglose
    And debe ver la sección "Ingresos" en el desglose
    And debe ver la sección "Gastos Fijos" en el desglose
    And debe ver la sección "Compromisos de Ahorro" en el desglose
    And debe ver la sección "Gastos Variables" en el desglose

  @savings @spendable @error
  Scenario: Max spendable shows overdraft warning when commitments exceed income
    Given que el usuario de ahorros ha iniciado sesión
    When navega a la página de ahorros
    Then debe ver la tarjeta "Disponible para Gastar" con desglose
    And debe ver el mensaje de sobregiro "Tus gastos y compromisos de ahorro exceden tus ingresos este mes."

  # ============================================================================
  # META COMPLETADA (badge, barra 100% y contribuir bloqueado)
  # ============================================================================

  @savings @summary @visual
  Scenario: Completed goal shows badge and full progress
    Given que el usuario de ahorros ha iniciado sesión
    When navega a la página de ahorros
    Then la tarjeta "Meta Completada" debe mostrar insignia "¡Meta completada!"
    And la tarjeta "Meta Completada" debe mostrar progreso "100.0%"
    And el botón de contribuir de la meta "Meta Completada" debe estar deshabilitado

  # ============================================================================
  # CREAR META - FLUJO EXITOSO (nombre único → tarjeta visible)
  # ============================================================================

  @savings @create @happy-path
  Scenario: Create a savings goal successfully
    Given que el usuario de ahorros ha iniciado sesión
    When navega a la página de ahorros
    And abre el modal de creación de meta
    And ingresa un nombre único de meta con prefijo "Vacaciones E2E"
    And selecciona el tipo de meta "Corto Plazo"
    And ingresa "200000" en el monto objetivo
    And ingresa "50000" en la contribución mensual
    And envía el formulario de creación de meta
    Then la tarjeta de meta con el nombre único debe ser visible
    And la tarjeta de meta con el nombre único debe mostrar el monto objetivo "$2.000,00"

  # ============================================================================
  # CREAR META - VALIDACIÓN (form vacío y montos inválidos)
  # ============================================================================

  @savings @create @validation
  Scenario: Create goal validates required fields on empty form
    Given que el usuario de ahorros ha iniciado sesión
    When navega a la página de ahorros
    And abre el modal de creación de meta
    And envía el formulario de creación de meta
    Then debe ver errores de validación en el modal
    And el campo nombre de la meta debe estar marcado como inválido
    When presiona Escape
    Then el modal de creación de meta debe cerrarse

  @savings @create @validation
  Scenario: Create goal rejects zero target amount
    Given que el usuario de ahorros ha iniciado sesión
    When navega a la página de ahorros
    And abre el modal de creación de meta
    And ingresa un nombre único de meta con prefijo "Meta Invalida"
    And ingresa "0" en el monto objetivo
    And envía el formulario de creación de meta
    Then debe ver errores de validación en el modal
    When presiona Escape
    Then el modal de creación de meta debe cerrarse

  # ============================================================================
  # CONTRIBUIR - HAPPY PATH (progreso + saldo de cuenta reducido)
  # ============================================================================

  @savings @contribute @happy-path
  Scenario: Contribute to a goal updates progress and reduces account balance
    Given que el usuario de ahorros ha iniciado sesión
    And guarda los saldos actuales de las cuentas del usuario de ahorros
    When navega a la página de ahorros
    And abre el modal de contribución para la meta "Fondo de Emergencia"
    Then debe ver el modal de contribución
    When ingresa "100000" en el monto de contribución
    And selecciona la cuenta de origen para contribución
    And confirma la contribución
    Then el modal de contribución debe cerrarse
    And la tarjeta "Fondo de Emergencia" debe reflejar el ahorro actual en la base de datos
    And la tarjeta "Fondo de Emergencia" debe mostrar contribución reciente "+$1.000,00"
    When navega a la página de cuentas
    Then la cuenta "Cuenta Corriente" debe mostrar el saldo reducido en 100000 por la contribución

  # ============================================================================
  # CONTRIBUIR - VALIDACIÓN (monto 0 bloqueado)
  # ============================================================================

  @savings @contribute @validation
  Scenario: Contribute with zero amount keeps submit disabled
    Given que el usuario de ahorros ha iniciado sesión
    When navega a la página de ahorros
    And abre el modal de contribución para la meta "Pequeña Meta"
    Then debe ver el modal de contribución
    And el botón de confirmar contribución debe estar deshabilitado
    When presiona Escape
    Then el modal de contribución debe cerrarse

  # ============================================================================
  # EDITAR META - HAPPY PATH (nombre + monto objetivo)
  # ============================================================================

  @savings @edit @happy-path
  Scenario: Edit a goal changes name and target amount
    Given que el usuario de ahorros ha iniciado sesión
    When navega a la página de ahorros
    And abre el modal de creación de meta
    And ingresa un nombre único de meta con prefijo "Meta Editable"
    And ingresa "100000" en el monto objetivo
    And envía el formulario de creación de meta
    Then la tarjeta de meta con el nombre único debe ser visible
    When abre el modal de edición para la meta con el nombre único
    And cambia el nombre a un nombre único de meta con prefijo "Meta Editada"
    And cambia el monto objetivo a "200000"
    And guarda los cambios de la meta
    Then la tarjeta de meta con el nombre editado debe ser visible
    And la tarjeta de meta con el nombre editado debe mostrar el monto objetivo "$2.000,00"

  # ============================================================================
  # EDITAR META - VALIDACIÓN (target por debajo del ahorrado → error del server)
  # ============================================================================

  @savings @edit @validation
  Scenario: Edit goal rejects target below already saved amount
    Given que el usuario de ahorros ha iniciado sesión
    When navega a la página de ahorros
    And abre el modal de edición para la meta "Pequeña Meta"
    And cambia el monto objetivo a "10000"
    And guarda los cambios de la meta
    Then debe ver el error "Cannot lower the target" en el modal de edición
    When presiona Escape
    Then el modal de edición de meta debe cerrarse

  # ============================================================================
  # EDITAR ESTADO → CANCELADA + CONTRIBUIR RECHAZADO
  # ============================================================================

  @savings @edit @contribute @validation
  Scenario: Cancelling a goal blocks future contributions
    Given que el usuario de ahorros ha iniciado sesión
    When navega a la página de ahorros
    And abre el modal de creación de meta
    And ingresa un nombre único de meta con prefijo "Meta Cancelable"
    And ingresa "100000" en el monto objetivo
    And envía el formulario de creación de meta
    Then la tarjeta de meta con el nombre único debe ser visible
    When abre el modal de edición para la meta con el nombre único
    And cambia el estado a "Cancelada"
    And guarda los cambios de la meta
    Then el modal de edición de meta debe cerrarse
    And abre el modal de contribución para la meta con el nombre único
    And ingresa "10000" en el monto de contribución
    And selecciona la cuenta de origen para contribución
    And confirma la contribución
    Then debe ver el error "Cannot contribute to a cancelled goal" en el modal de contribución

  # ============================================================================
  # ELIMINAR META - HAPPY PATH (sin contribuciones)
  # ============================================================================

  @savings @delete @happy-path
  Scenario: Delete a goal without contributions removes its card
    Given que el usuario de ahorros ha iniciado sesión
    When navega a la página de ahorros
    And abre el modal de creación de meta
    And ingresa un nombre único de meta con prefijo "Meta Deletable"
    And ingresa "75000" en el monto objetivo
    And envía el formulario de creación de meta
    Then la tarjeta de meta con el nombre único debe ser visible
    When abre el modal de eliminación para la meta con el nombre único
    Then debe ver el modal de confirmación de eliminación
    When confirma la eliminación
    Then la tarjeta de meta con el nombre único debe desaparecer

  # ============================================================================
  # ELIMINAR META - VALIDACIÓN (con contribuciones → bloqueado + warning)
  # ============================================================================

  @savings @delete @validation
  Scenario: Delete goal with contributions is blocked with a warning
    Given que el usuario de ahorros ha iniciado sesión
    When navega a la página de ahorros
    And abre el modal de eliminación para la meta "Meta Completada"
    Then debe ver el modal de confirmación de eliminación
    And debe ver el warning de contribuciones en el modal de eliminación
    And el botón de confirmar eliminación debe estar deshabilitado
    When presiona Escape
    Then el modal de eliminación debe cerrarse
    And la tarjeta "Meta Completada" debe ser visible

  # ============================================================================
  # LOCALIZACIÓN EN INGLÉS
  # ============================================================================

  @savings @i18n
  Scenario: Savings page renders in English
    Given que el usuario de ahorros ha iniciado sesión
    When navega a la página de ahorros en inglés
    Then debe ver el título de sección "Savings"
    And debe ver la tarjeta "Total Saved"
    And debe ver la tarjeta "Available to Spend"
    And debe ver el botón "New Goal" en la página de ahorros