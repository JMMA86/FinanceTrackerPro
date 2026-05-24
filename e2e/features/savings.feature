Feature: Gestión de Metas de Ahorro — Savings Goals
  Como usuario autenticado de FinanceTrackerPro
  Quiero gestionar mis metas de ahorro
  Para ahorrar con propósito y seguir mi progreso

  # ============================================================================
  # EMPTY STATE
  # ============================================================================

  @savings @empty @visual
  Scenario: Empty savings page shows create prompt
    Given que el usuario de ahorros ha iniciado sesión
    Given que no tiene metas de ahorro
    When navega a la página de ahorros
    Then debe ver el título de sección "Ahorros"
    Then debe ver el mensaje de empty state "No tienes metas de ahorro"
    Then debe ver el botón "Nueva Meta" en el empty state

  # ============================================================================
  # SUMMARY CARDS
  # ============================================================================

  @savings @summary @visual
  Scenario: Summary cards display correctly with active and completed goals
    Given que el usuario de ahorros ha iniciado sesión
    Given que tiene metas de ahorro activas y completadas
    When navega a la página de ahorros
    Then debe ver la tarjeta "Total Ahorrado"
    Then debe ver la tarjeta "Meta Total"
    Then debe ver la tarjeta "Progreso General"
    Then debe ver la tarjeta "Disponible para Gastar"

  # ============================================================================
  # MAX SPENDABLE CARD
  # ============================================================================

  @savings @spendable @visual
  Scenario: Max spendable card displays breakdown
    Given que el usuario de ahorros ha iniciado sesión
    Given que tiene metas de ahorro activas y completadas
    When navega a la página de ahorros
    Then debe ver la tarjeta "Disponible para Gastar" con desglose
    Then debe ver la sección "Ingresos" en el desglose
    Then debe ver la sección "Gastos Fijos" en el desglose
    Then debe ver la sección "Compromisos de Ahorro" en el desglose
    Then debe ver la sección "Gastos Variables" en el desglose
