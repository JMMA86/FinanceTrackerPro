Feature: Gestión de Transacciones
  Como usuario autenticado de FinanceTrackerPro
  Quiero registrar, consultar y gestionar mis transacciones
  Para llevar un control preciso de mis ingresos y gastos

  # NOTA: No se usa Background porque playwright-bdd@8.5.1 tiene un bug donde
  # testInfo.line devuelve valores incorrectos en ejecución paralela (2 workers)
  # cuando se usa test.beforeEach, causando bddTestData not found.
  # Workaround: los pasos de login + navegación se repiten en cada escenario.

  # ============================================================================
  # VISUAL / CONTENIDO
  # ============================================================================

  @transactions @visual @happy-path @desktop
  Scenario: La página de transacciones carga correctamente en desktop
    Given que el usuario de transacciones ha iniciado sesión
    And navega a la página de transacciones
    Given que la pantalla es de escritorio
    Then debe ver el título "Transacciones"
    And debe ver la tabla de transacciones
    And debe ver los encabezados "Fecha", "Descripción", "Tipo", "Cuenta", "Monto"

  @transactions @visual
  Scenario: Las transacciones se muestran con formato correcto
    Given que el usuario de transacciones ha iniciado sesión
    And navega a la página de transacciones
    Then los montos de gastos deben mostrarse en color rojo
    And los montos de ingresos deben mostrarse en color verde

  # ============================================================================
  # FILTROS
  # ============================================================================

  @transactions @filter
  Scenario: Filtro de búsqueda por descripción actualiza la URL
    Given que el usuario de transacciones ha iniciado sesión
    And navega a la página de transacciones
    When escribe "nomina" en el campo de búsqueda
    And espera el debounce de búsqueda
    Then la URL debe contener "search=nomina"

  @transactions @filter
  Scenario: Filtro por tipo de transacción funciona
    Given que el usuario de transacciones ha iniciado sesión
    And navega a la página de transacciones
    When selecciona "Gasto" en el filtro de tipo
    Then la URL debe contener "type=EXPENSE"

  @transactions @filter
  Scenario: Filtro por rango de fechas funciona
    Given que el usuario de transacciones ha iniciado sesión
    And navega a la página de transacciones
    When ingresa "2026-01-01" en el campo fecha desde
    And ingresa "2026-02-01" en el campo fecha hasta
    Then la URL debe contener "dateFrom=2026-01-01"
    And la URL debe contener "dateTo=2026-02-01"

  @transactions @filter
  Scenario: Los filtros se pueden limpiar desde la URL
    Given que el usuario de transacciones ha iniciado sesión
    And navega a la página de transacciones
    Given que hay filtros activos en la URL
    When limpia todos los filtros
    Then la URL no debe tener parámetros de filtro

  # ============================================================================
  # PAGINACIÓN
  # ============================================================================

  @transactions @pagination
  Scenario: La paginación muestra el total de transacciones
    Given que el usuario de transacciones ha iniciado sesión
    And navega a la página de transacciones
    Then debe ver el texto de paginación
    And el botón "Página anterior" debe estar deshabilitado

  @transactions @pagination
  Scenario: La paginación permite navegar a la página siguiente
    Given que el usuario de transacciones ha iniciado sesión
    And navega a la página de transacciones
    When hace clic en "Página siguiente"
    Then la URL debe contener "page=2"
    And debe ver el texto "11–20 de 20 transacciones"

  @transactions @pagination
  Scenario: El botón de página anterior se habilita en página 2
    Given que el usuario de transacciones ha iniciado sesión
    And navega a la página de transacciones
    Given que navega a la página 2 de transacciones
    Then el botón "Página anterior" debe estar habilitado

  # ============================================================================
  # MODAL - CREAR TRANSACCIÓN
  # ============================================================================

  @transactions @modal
  Scenario: El modal de crear transacción abre con todos los campos
    Given que el usuario de transacciones ha iniciado sesión
    And navega a la página de transacciones
    When hace clic en "Nueva transacción"
    Then debe ver un diálogo con título "Crear transacción"
    And debe ver el campo tipo con opciones "Gasto" e "Ingreso"
    And debe ver el campo cuenta
    And debe ver el campo valor
    And debe ver el campo descripción
    And debe ver el campo fecha
    And debe ver el botón "Crear transacción"
    And debe ver el botón "Cancelar"

  @transactions @modal @close
  Scenario: El modal de crear transacción cierra con Escape
    Given que el usuario de transacciones ha iniciado sesión
    And navega a la página de transacciones
    Given que el modal de transacción está abierto
    When presiona la tecla Escape
    Then el diálogo debe estar cerrado

  @transactions @modal @close
  Scenario: El modal de crear transacción cierra con botón Cancelar
    Given que el usuario de transacciones ha iniciado sesión
    And navega a la página de transacciones
    Given que el modal de transacción está abierto
    When hace clic en "Cancelar" en el modal
    Then el diálogo debe estar cerrado

  @transactions @modal @validation
  Scenario: El formulario de crear transacción valida campos requeridos
    Given que el usuario de transacciones ha iniciado sesión
    And navega a la página de transacciones
    Given que el modal de transacción está abierto
    When intenta enviar el formulario de transacción vacío
    Then debe ver mensajes de error de validación
    And el campo cuenta debe mostrar error
    And el campo valor debe mostrar error

  @transactions @create @happy-path
  Scenario: Crear una transacción de ingreso exitosamente
    Given que el usuario de transacciones ha iniciado sesión
    And navega a la página de transacciones
    Given que el modal de transacción está abierto
    When selecciona "Ingreso" como tipo
    And selecciona "Efectivo" como cuenta
    And ingresa "50000" en el campo valor
    And ingresa "Ingreso de prueba E2E" como descripción
    And envía el formulario de creación de transacción
    Then debe ver una notificación de éxito
    And la transacción debe aparecer en la tabla

  # ============================================================================
  # MOBILE
  # ============================================================================

  @mobile @transactions
  Scenario: La página de transacciones es responsive en mobile
    Given que el usuario de transacciones ha iniciado sesión
    Given que la pantalla es móvil 390x844
    When navega a la página de transacciones
    Then debe ver el título "Transacciones"
    And la tabla de transacciones debe ser visible
