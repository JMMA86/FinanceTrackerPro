Feature: Gestión de Cuentas de Inversión — Transacciones
  Como usuario autenticado de FinanceTrackerPro
  Quiero crear cuentas de inversión, depositar fondos y comprar activos
  Para gestionar mi portafolio de inversiones

  # ============================================================================
  # CREAR CUENTA - FLUJO EXITOSO
  # ============================================================================

  @investments @create @happy-path
  Scenario: Crear cuenta de inversión exitosa con USD
    Given que el usuario de inversiones ha iniciado sesión
    When navega a la página de inversiones
    And abre el modal de nueva cuenta de inversión
    And ingresa "Mi Inversión USA" en el nombre de la inversión
    And selecciona "USD" como moneda de inversión
    And ingresa "500000" en el saldo inicial de inversión
    And envía el formulario de creación de inversión
    Then la cuenta de inversión debe crearse exitosamente
    And la nueva cuenta de inversión debe aparecer en el grid
    And la tarjeta debe mostrar el nombre "Mi Inversión USA"
    And la tarjeta debe mostrar un balance positivo

  # ============================================================================
  # DEPÓSITO
  # ============================================================================

  @investments @modal @deposit
  Scenario: Modal de depósito se abre con datos correctos
    Given que el usuario de inversiones ha iniciado sesión
    Given que existe una cuenta de inversión con saldo
    When navega a la página de inversiones
    And hace clic en "Depositar" en la página de inversiones
    Then debe ver el modal de depósito con título "Depositar a Inversión"
    And debe ver el campo "Cuenta de Origen (COP)" en el modal
    And debe ver el campo "Cuenta de Destino" en el modal
    And debe ver el campo "Monto en COP" en el modal
    And debe ver el campo "Tasa de Cambio" en el modal

  @investments @deposit @happy-path
  Scenario: Depositar a cuenta de inversión con tasa de cambio
    Given que el usuario de inversiones ha iniciado sesión
    Given que existe una cuenta de inversión con saldo
    When navega a la página de inversiones
    And abre el modal de depósito de inversión
    And selecciona la cuenta bancaria COP en el depósito
    And ingresa "500000" en el monto COP de depósito
    And ingresa "4000" como tasa de cambio
    Then debe ver el estimado de recibo en el modal
    When envía el formulario de depósito
    Then el modal de depósito debe cerrarse
    And la tarjeta de inversión debe mostrar balance actualizado

  # ============================================================================
  # COMPRA DE ACTIVO
  # ============================================================================

  @investments @search @buy
  Scenario: Modal de compra de activo se abre y muestra búsqueda
    Given que el usuario de inversiones ha iniciado sesión
    Given que existe una cuenta de inversión con saldo suficiente
    When navega a la página de inversiones
    And selecciona la cuenta de inversión "Mi Inversión USA"
    Then debe ver el botón "Comprar Activo" visible en la página
    When hace clic en "Comprar Activo"
    Then debe ver el modal de compra con título "Comprar Activo"
    And debe ver el campo de búsqueda de acciones
    And debe ver el saldo disponible de la cuenta

  @investments @search @result
  Scenario: Búsqueda de acciones en el modal
    Given que el usuario de inversiones ha iniciado sesión
    Given que existe una cuenta de inversión con saldo suficiente
    When navega a la página de inversiones
    And selecciona la cuenta de inversión "Mi Inversión USA"
    And abre el modal de compra de activo
    When escribe "AAPL" en el buscador de acciones
    Then debe ver resultados de búsqueda o mensaje de error

  # ============================================================================
  # PORTAFOLIO / POSICIONES
  # ============================================================================

  @investments @portfolio @visual
  Scenario: Portafolio muestra empty state cuando no hay posiciones
    Given que el usuario de inversiones ha iniciado sesión
    Given que existe una cuenta de inversión con saldo
    When navega a la página de inversiones
    And selecciona la cuenta de inversión "Mi Inversión USA"
    Then debe ver la sección de posiciones vacía "Sin posiciones abiertas"
    And debe ver la sección de transacciones de la inversión
