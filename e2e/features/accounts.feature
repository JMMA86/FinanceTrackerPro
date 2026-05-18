Feature: Gestión de Cuentas Bancarias
  Como usuario autenticado de FinanceTrackerPro
  Quiero gestionar mis cuentas bancarias
  Para organizar mi dinero y llevar un control financiero

  Background:
    Given que el usuario de cuentas ha iniciado sesión
    And que no existen cuentas bancarias

  # ============================================================================
  # VISUAL / CONTENIDO
  # ============================================================================

  @accounts @visual @happy-path
  Scenario: Página de cuentas carga con header y botón de nueva cuenta
    When navega a la página de cuentas
    Then debe ver el título de sección "Cuentas de Banco"
    And debe ver el botón "Nueva Cuenta" en el encabezado

  @accounts @visual @empty-state
  Scenario: Estado vacío se muestra cuando no hay cuentas
    When navega a la página de cuentas
    Then debe ver el mensaje de empty state "Sin cuentas bancarias"
    And debe ver el botón "Nueva Cuenta" en el empty state
    And debe ver el mensaje descriptivo en el empty state

  @accounts @visual
  Scenario: Secciones placeholder de Inversiones y Tarjetas son visibles
    When navega a la página de cuentas
    Then debe ver la sección "Cuentas de Inversión" con label "En desarrollo"
    And debe ver la sección "Tarjetas de Crédito" con label "En desarrollo"

  @accounts @visual @navigation
  Scenario: Sidebar marca Cuentas como activo
    When navega a la página de cuentas
    Then el enlace "Cuentas" en el sidebar debe estar marcado como activo

  # ============================================================================
  # CREAR CUENTA - MODAL
  # ============================================================================

  @accounts @modal @create
  Scenario: Modal de crear cuenta se abre al hacer clic en Nueva Cuenta
    When navega a la página de cuentas
    And abre el modal de nueva cuenta
    Then debe ver el modal de creación con título "Nueva Cuenta"
    And debe ver el campo "Nombre de la Cuenta" en el modal
    And debe ver el campo "Tipo de Cuenta" en el modal
    And debe ver el campo "Moneda" en el modal
    And debe ver el campo "Saldo Inicial" en el modal
    And debe ver el botón "Cancelar" en el modal
    And debe ver el botón "Crear Cuenta" en el modal

  @accounts @modal @validation
  Scenario: Formulario de crear cuenta valida campos requeridos
    Given que el modal de creación está abierto
    When intenta enviar el formulario vacío
    Then debe ver errores de validación en el modal
    And el campo nombre debe estar marcado como inválido

  @accounts @modal @create
  Scenario: Seleccionar tipo SAVINGS muestra campo de tasa de interés
    Given que el modal de creación está abierto
    When selecciona el tipo "Cuenta de Ahorros"
    Then debe ver el campo de tasa de interés visible
    When selecciona el tipo "Cuenta Corriente"
    Then el campo de tasa de interés debe estar oculto

  @accounts @modal @close
  Scenario: Modal se cierra con botón Cancelar
    Given que el modal de creación está abierto
    When cierra el modal con Cancelar
    Then el modal debe estar cerrado

  @accounts @modal @close
  Scenario: Modal se cierra con tecla Escape
    Given que el modal de creación está abierto
    When presiona Escape en el modal
    Then el modal debe estar cerrado

  # ============================================================================
  # CREAR CUENTA - FLUJO EXITOSO
  # ============================================================================

  @accounts @create @happy-path
  Scenario: Crear cuenta exitosa con datos válidos
    Given que el modal de creación está abierto
    When ingresa "Mi Cuenta Corriente" en el campo nombre
    And selecciona el tipo "Cuenta Corriente"
    And ingresa "1000000" en el campo de saldo inicial
    And envía el formulario de creación
    Then la cuenta debe crearse exitosamente
    And la nueva cuenta debe aparecer en el grid

  # ============================================================================
  # ELIMINAR CUENTA
  # ============================================================================

  @accounts @delete
  Scenario: Eliminar cuenta desde el panel de detalle
    Given que existe una cuenta bancaria
    When abre el panel de detalle de la cuenta
    Then debe ver el panel de detalle con la información de la cuenta
    When hace clic en eliminar en el panel de detalle
    Then debe ver el modal de confirmación "Eliminar Cuenta"
    When confirma la eliminación de la cuenta
    Then la cuenta debe ser eliminada del grid

  # ============================================================================
  # LOADING / SKELETON
  # ============================================================================

  @accounts @loading @skeleton
  Scenario: Loading skeleton se muestra durante la carga inicial
    When navega a la página de cuentas
    Then el skeleton de carga puede mostrarse inicialmente
    And eventualmente el contenido de cuentas debe cargarse

  # ============================================================================
  # MOBILE
  # ============================================================================

  @mobile @accounts
  Scenario: Página de cuentas es responsive en viewport móvil
    Given que la pantalla es móvil 390x844
    When navega a la página de cuentas
    Then la página de cuentas debe mostrarse correctamente en mobile
