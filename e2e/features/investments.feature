Feature: Gestión de Cuentas de Inversión — Visual y Modal
  Como usuario autenticado de FinanceTrackerPro
  Quiero ver la página de inversiones y entender el modal de creación
  Para familiarizarme con la interfaz de inversiones

  # ============================================================================
  # VISUAL / CONTENIDO
  # ============================================================================

  @investments @visual @happy-path
  Scenario: Página de inversiones carga con header y estado vacío
    Given que el usuario de inversiones ha iniciado sesión
    And que no existen cuentas de inversión
    When navega a la página de inversiones
    Then debe ver el título de sección "Inversiones"
    And debe ver el mensaje de empty state "Sin cuentas de inversión"
    And debe ver el botón "Nueva Cuenta de Inversión" en el empty state

  @investments @visual @navigation
  Scenario: Sidebar marca Inversiones como activo
    Given que el usuario de inversiones ha iniciado sesión
    Given que la pantalla es de escritorio
    When navega a la página de inversiones
    Then el enlace "Inversiones" en el sidebar debe estar marcado como activo

  # ============================================================================
  # CREAR CUENTA - MODAL
  # ============================================================================

  @investments @modal @create
  Scenario: Modal de crear cuenta de inversión se abre
    Given que el usuario de inversiones ha iniciado sesión
    When navega a la página de inversiones
    And abre el modal de nueva cuenta de inversión
    Then debe ver el modal de inversión con título "Nueva Cuenta de Inversión"
    And debe ver el campo "Nombre de la Cuenta" en el modal
    And debe ver el campo "Moneda" en el modal
    And debe ver el campo "Saldo Inicial" en el modal
    And debe ver el botón "Cancelar" en el modal
    And debe ver el botón "Crear Cuenta" en el modal

  @investments @modal @validation
  Scenario: Validación del formulario de creación de inversión
    Given que el usuario de inversiones ha iniciado sesión
    When navega a la página de inversiones
    And abre el modal de nueva cuenta de inversión
    And intenta enviar el formulario de inversión vacío
    Then debe ver errores de validación en el modal

  # ============================================================================
  # MOBILE
  # ============================================================================

  @investments @mobile
  Scenario: Página de inversiones es responsive en viewport móvil
    Given que el usuario de inversiones ha iniciado sesión
    Given que la pantalla es móvil 390x844
    When navega a la página de inversiones
    Then debe ver el título "Inversiones"
    And la página de inversiones debe mostrarse correctamente en mobile
