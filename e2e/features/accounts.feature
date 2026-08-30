Feature: Gestión de Cuentas Bancarias
  Como usuario autenticado de FinanceTrackerPro
  Quiero gestionar mis cuentas bancarias
  Para organizar mi dinero y llevar un control financiero

  # ============================================================================
  # VISUAL / CONTENIDO
  # ============================================================================

  @accounts @visual @happy-path
  Scenario: Página de cuentas carga con header y botón de nueva cuenta
    Given que el usuario de cuentas ha iniciado sesión
    And que no existen cuentas bancarias
    When navega a la página de cuentas
    Then debe ver el título de sección "Cuentas de Banco"
    And debe ver el botón "Nueva Cuenta" en el encabezado

  @accounts @visual @empty-state
  Scenario: Estado vacío se muestra cuando no hay cuentas
    Given que el usuario de cuentas ha iniciado sesión
    And que no existen cuentas bancarias
    When navega a la página de cuentas
    Then debe ver el mensaje de empty state "Sin cuentas bancarias"
    And debe ver el botón "Nueva Cuenta" en el empty state
    And debe ver el mensaje descriptivo en el empty state

  @accounts @visual
  Scenario: Sección placeholder de Tarjetas de Crédito es visible
    Given que el usuario de cuentas ha iniciado sesión
    And que no existen cuentas bancarias
    When navega a la página de cuentas
    Then debe ver la sección "Tarjetas de Crédito" con label "En desarrollo"

  @accounts @visual @navigation
  Scenario: Sidebar marca Cuentas como activo
    Given que el usuario de cuentas ha iniciado sesión
    And que no existen cuentas bancarias
    When navega a la página de cuentas
    Then el enlace "Cuentas" en el sidebar debe estar marcado como activo

  # ============================================================================
  # CREAR CUENTA - MODAL
  # ============================================================================

  @accounts @modal @create
  Scenario: Modal de crear cuenta se abre al hacer clic en Nueva Cuenta
    Given que el usuario de cuentas ha iniciado sesión
    And que no existen cuentas bancarias
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
    Given que el usuario de cuentas ha iniciado sesión
    And que no existen cuentas bancarias
    Given que el modal de creación está abierto
    When intenta enviar el formulario vacío
    Then debe ver errores de validación en el modal
    And el campo nombre debe estar marcado como inválido

  @accounts @modal @create
  Scenario: Seleccionar tipo SAVINGS muestra campo de tasa de interés
    Given que el usuario de cuentas ha iniciado sesión
    And que no existen cuentas bancarias
    Given que el modal de creación está abierto
    When selecciona el tipo "Cuenta de Ahorros"
    Then debe ver el campo de tasa de interés visible
    When selecciona el tipo "Cuenta Corriente"
    Then el campo de tasa de interés debe estar oculto

  @accounts @modal @close
  Scenario: Modal se cierra con botón Cancelar
    Given que el usuario de cuentas ha iniciado sesión
    And que no existen cuentas bancarias
    Given que el modal de creación está abierto
    When cierra el modal con Cancelar
    Then el modal debe estar cerrado

  @accounts @modal @close
  Scenario: Modal se cierra con tecla Escape
    Given que el usuario de cuentas ha iniciado sesión
    And que no existen cuentas bancarias
    Given que el modal de creación está abierto
    When presiona Escape en el modal
    Then el modal debe estar cerrado

  # ============================================================================
  # CREAR CUENTA - FLUJO EXITOSO
  # ============================================================================

  @accounts @create @happy-path
  Scenario: Crear cuenta exitosa con datos válidos
    Given que el usuario de cuentas ha iniciado sesión
    And que no existen cuentas bancarias
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
    Given que el usuario de cuentas ha iniciado sesión
    And que no existen cuentas bancarias
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
    Given que el usuario de cuentas ha iniciado sesión
    And que no existen cuentas bancarias
    When navega a la página de cuentas
    Then el skeleton de carga puede mostrarse inicialmente
    And eventualmente el contenido de cuentas debe cargarse

  # ============================================================================
  # MOBILE
  # ============================================================================

  @mobile @accounts
  Scenario: Página de cuentas es responsive en viewport móvil
    Given que el usuario de cuentas ha iniciado sesión
    And que no existen cuentas bancarias
    Given que la pantalla es móvil 390x844
    When navega a la página de cuentas
    Then la página de cuentas debe mostrarse correctamente en mobile

  # ============================================================================
  # ELIMINAR CUENTA - REGLAS DE INTEGRIDAD
  # ============================================================================

  # NOTA sobre visibilidad: cuando deleteBankAccount rechaza la operación
  # (ACCOUNT_HAS_BALANCE), DeleteConfirmModal NO cierra el <dialog> (solo llama
  # a closeModal() en éxito) y el toast de error queda DETRÁS del top layer del
  # dialog abierto — no es asertable. Lo observable: el modal permanece abierto,
  # el botón se re-habilita y, tras cerrarlo, la cuenta sigue activa en el grid.

  @accounts @delete @integrity
  Scenario: No se puede eliminar una cuenta con saldo
    Given que el usuario de cuentas ha iniciado sesión
    And que no existen cuentas bancarias
    Given que el modal de creación está abierto
    When ingresa un nombre único de cuenta con prefijo "Cuenta Con Saldo"
    And selecciona el tipo "Cuenta Corriente"
    And ingresa "50000" en el campo de saldo inicial
    And envía el formulario de creación
    Then la cuenta debe crearse exitosamente
    And la nueva cuenta debe aparecer en el grid
    When abre el panel de detalle de la cuenta
    And hace clic en eliminar en el panel de detalle
    Then debe ver el modal de confirmación "Eliminar Cuenta"
    When confirma la eliminación de la cuenta esperando rechazo
    Then el modal de confirmación de eliminación debe permanecer abierto
    When cierra el modal de confirmación con Cancelar
    And navega a la página de cuentas
    Then la cuenta con el nombre único debe seguir en el grid

  # NOTA (Regla 3): al eliminar una cuenta con saldo 0 (soft delete), sus
  # transacciones SIGUEN en el historial y la tabla muestra el nombre de la
  # cuenta vía el include server (transaction.account.name) aunque la cuenta
  # esté inactiva — nunca "—".

  @accounts @delete @integrity
  Scenario: Eliminar cuenta con saldo 0 conserva el historial
    Given que el usuario de cuentas ha iniciado sesión
    And que no existen cuentas bancarias
    # Cuenta que PERMANECE activa: sin cuentas activas la página de
    # transacciones muestra el empty state "sin cuentas" y no la tabla.
    Given que el modal de creación está abierto
    When ingresa un nombre único de cuenta con prefijo "Cuenta Permanente"
    And selecciona el tipo "Cuenta Corriente"
    And ingresa "100000" en el campo de saldo inicial
    And envía el formulario de creación
    Then la cuenta debe crearse exitosamente
    # Cuenta objetivo (la que se eliminará) — se crea al final para que su
    # nombre sea el "nombre único" que los steps posteriores leen.
    Given que el modal de creación está abierto
    When ingresa un nombre único de cuenta con prefijo "Cuenta A Eliminar"
    And selecciona el tipo "Cuenta Corriente"
    And ingresa "50000" en el campo de saldo inicial
    And envía el formulario de creación
    Then la cuenta debe crearse exitosamente
    And la nueva cuenta debe aparecer en el grid
    When navega a la página de transacciones
    Given que el modal de transacción está abierto
    When selecciona "Gasto" como tipo
    And selecciona la cuenta recién creada como cuenta
    And ingresa "50000" en el campo valor
    And ingresa una descripción única "Gasto para eliminar cuenta"
    And envía el formulario de creación de transacción
    Then la transacción creada debe aparecer en la tabla
    When navega a la página de cuentas
    And abre el panel de detalle de la cuenta con el nombre único
    And hace clic en eliminar en el panel de detalle
    Then debe ver el modal de confirmación "Eliminar Cuenta"
    When confirma la eliminación de la cuenta
    Then la cuenta con el nombre único no debe estar en el grid
    When navega a la página de transacciones
    Then la fila "Saldo inicial" de la cuenta recién creada debe estar visible
    And la transacción recién creada debe estar visible con el nombre de la cuenta eliminada
