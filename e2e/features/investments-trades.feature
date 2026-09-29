Feature: Inversiones — Operaciones estructuradas (editar, deshacer y cantidad decimal)
  Como usuario autenticado de FinanceTrackerPro
  Quiero gestionar mis operaciones de compra estructuradas desde la actividad
  Para corregir cantidades decimales con coma y deshacer una operación

  # Deterministic data only: the seeded "Portafolio Trade E2E" account owns two
  # structured BUY trades (AAPL 5 @ $200.00, MSFT 3 @ $300.00) whose quantity and
  # price come straight from the E2E seed. No scenario selects a symbol or relies
  # on the server-side quote to build its data; the edit flow may still raise the
  # ±2% market-price confirmation, which the steps accept with the user's price.

  Background:
    Given que el usuario de operaciones de inversión ha iniciado sesión
    When navega a la página de inversiones
    And selecciona la cuenta de inversión "Portafolio Trade E2E"

  @investments @trades @visual @happy-path
  Scenario: La actividad muestra la operación estructurada con acciones habilitadas
    Then la actividad de inversión debe mostrar "Compra" de "AAPL" con cantidad "5"
    And los botones "Editar operación" y "Deshacer operación" de la operación "AAPL" deben estar visibles y habilitados

  @investments @trades @edit @decimal @regression
  Scenario: Editar la cantidad decimal con coma normaliza el separador
    When hace clic en "Editar operación" de la operación "AAPL"
    Then el modal de edición debe estar visible con título "Editar operación"
    When escribe "2,243695838" en la cantidad de la operación
    And guarda los cambios de la operación
    Then el modal de edición debe cerrarse
    And la operación "AAPL" debe tener cantidad "2.243695838" en la base de datos

  @investments @trades @undo
  Scenario: Deshacer una operación la quita de la actividad
    When hace clic en "Deshacer operación" de la operación "MSFT"
    Then el diálogo de deshacer debe estar visible con título "Deshacer operación"
    When confirma deshacer la operación
    Then el diálogo de deshacer debe cerrarse
    And la operación "MSFT" ya no debe aparecer en la actividad
    And la operación "MSFT" debe quedar inactiva en la base de datos

  @investments @trades @sell @decimal
  Scenario: El modal de venta acepta una cantidad decimal con coma
    When hace clic en "Vender" para el activo "AAPL"
    Then el modal de venta debe estar visible con título "Vender Activo"
    When escribe "0,05" en la cantidad de venta
    Then la cantidad de venta debe mostrarse como "0,05"
