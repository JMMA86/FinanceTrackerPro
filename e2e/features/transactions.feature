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
    And debe ver los encabezados "Fecha", "Descripción", "Tipo", "Cuenta", "Categoría", "Monto", "Acciones"

  @transactions @visual
  Scenario: Las transacciones muestran fecha y hora
    Given que el usuario de transacciones ha iniciado sesión
    And navega a la página de transacciones
    Then las celdas de fecha deben mostrar fecha y hora

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

  # ============================================================================
  # EMPTY STATE - NO ACCOUNTS
  # ============================================================================

  # NOTA: las notificaciones del store de UI (Zustand) NO se renderizan en el DOM
  # (no existe componente de toasts), por lo que los flujos de éxito se verifican
  # por el cierre del modal + actualización de la tabla, y los de error por la
  # permanencia del modal abierto (el server action rechaza la operación).

  @transactions @empty-state @no-accounts
  Scenario: Usuario sin cuentas ve aviso y no puede crear transacciones
    Given que el usuario navega a la página de login en español
    When cambia a modo registro en desktop
    And ingresa "E2E Sin Cuentas" en el campo nombre del registro desktop
    And ingresa un email único en el registro desktop
    And ingresa "E2ePassword123" en el campo contraseña del registro desktop
    And hace clic en "Registrarse" en el registro desktop
    And inicia sesión con el email recién registrado
    And navega a la página de transacciones
    Then debe ver el aviso de crear cuenta
    And el botón "Nueva transacción" no debe estar visible
    When hace clic en el enlace "Crear cuenta"
    Then debe ser redirigido a la página de cuentas

  # ============================================================================
  # CREATE - EXPENSE
  # ============================================================================

  @transactions @create @expense
  Scenario: Crear una transacción de gasto exitosamente
    Given que el usuario de transacciones ha iniciado sesión
    And navega a la página de transacciones
    Given que el modal de transacción está abierto
    When selecciona "Gasto" como tipo
    And selecciona "Efectivo" como cuenta
    And ingresa "10000" en el campo valor
    And ingresa "Gasto de prueba E2E" como descripción
    And envía el formulario de creación de transacción
    Then debe ver una notificación de éxito
    And la transacción con descripción "Gasto de prueba E2E" debe aparecer en la tabla

  # ============================================================================
  # CREATE - INSUFFICIENT FUNDS
  # ============================================================================

  # NOTA (Fix B): el error del server se muestra INLINE dentro del modal
  # (role="alert" con el texto localizado). El toast global queda por debajo
  # del top layer del <dialog> y NO se aserta.

  @transactions @create @insufficient-funds
  Scenario: Gasto con fondos insuficientes muestra error inline en el modal
    Given que el usuario de transacciones ha iniciado sesión
    And navega a la página de transacciones
    Given que el modal de transacción está abierto
    When selecciona "Gasto" como tipo
    And selecciona "Efectivo" como cuenta
    And ingresa "999999999" en el campo valor
    And envía el formulario de creación de transacción esperando error
    Then el diálogo de crear transacción debe permanecer abierto
    And debe ver el error "Fondos insuficientes en la cuenta seleccionada" dentro del diálogo de crear transacción

  # ============================================================================
  # DELETE - WITH CONFIRMATION
  # ============================================================================

  @transactions @delete
  Scenario: Eliminar una transacción con confirmación
    Given que el usuario de transacciones ha iniciado sesión
    And navega a la página de transacciones
    Given que el modal de transacción está abierto
    When selecciona "Ingreso" como tipo
    And selecciona "Efectivo" como cuenta
    And ingresa "5000" en el campo valor
    And ingresa una descripción única "Eliminar E2E"
    And envía el formulario de creación de transacción
    Then la transacción creada debe aparecer en la tabla
    When hace clic en el botón de eliminar de la fila de la transacción creada
    Then debe ver el diálogo de confirmación de eliminación
    When hace clic en "Cancelar" en el diálogo de eliminación
    Then el diálogo de eliminación debe cerrarse
    And la transacción creada debe aparecer en la tabla
    When hace clic en el botón de eliminar de la fila de la transacción creada
    And hace clic en "Eliminar" en el diálogo de eliminación
    Then el diálogo de eliminación debe cerrarse
    And la transacción creada no debe aparecer en la tabla

  # ============================================================================
  # EDIT - HAPPY PATH
  # ============================================================================

  # NOTA: el modal de edición es el MISMO <dialog> del de creación; cambia su
  # título accesible a "Editar transacción" (editTitle) y el aria-label del
  # lápiz es "Editar transacción". Los campos de tipo y cuenta quedan
  # deshabilitados y se rellenan desde la fila original.

  @transactions @edit @happy-path
  Scenario: Editar una transacción con éxito
    Given que el usuario de transacciones ha iniciado sesión
    And navega a la página de transacciones
    Given que el modal de transacción está abierto
    When selecciona "Ingreso" como tipo
    And selecciona "Efectivo" como cuenta
    And ingresa "50000" en el campo valor
    And ingresa una descripción única "Editar E2E"
    And envía el formulario de creación de transacción
    Then la transacción creada debe aparecer en la tabla
    When abre la edición de la transacción creada
    Then debe ver el diálogo de edición con los datos prefilled
    When cambia la descripción a una única "Editada E2E"
    And ingresa "75000" en el campo valor del diálogo de edición
    And envía la edición de la transacción
    Then el diálogo de edición debe cerrarse
    And la transacción editada debe aparecer en la tabla con monto 75000
    And la descripción original no debe aparecer en la tabla

  # ============================================================================
  # EDIT - VALIDATION (server error inline)
  # ============================================================================

  # NOTA: para disparar INSUFFICIENT_FUNDS al editar se necesita una transacción
  # EXPENSE (la validación de fondos solo aplica a gastos y el signo del monto se
  # deriva del tipo original). El error se renderiza INLINE con role="alert"
  # dentro del dialog y el modal permanece abierto.

  @transactions @edit @validation
  Scenario: Editar transacción con monto inválido muestra error inline
    Given que el usuario de transacciones ha iniciado sesión
    And navega a la página de transacciones
    Given que el modal de transacción está abierto
    When selecciona "Gasto" como tipo
    And selecciona "Efectivo" como cuenta
    And ingresa "10000" en el campo valor
    And ingresa una descripción única "Editar error E2E"
    And envía el formulario de creación de transacción
    Then la transacción creada debe aparecer en la tabla
    When abre la edición de la transacción creada
    And ingresa "999999999" en el campo valor del diálogo de edición
    And envía la edición de la transacción esperando error
    Then el diálogo de edición debe permanecer abierto
    And debe ver el error "Fondos insuficientes en la cuenta seleccionada" dentro del diálogo de edición

  # ============================================================================
  # CATEGORIES - CRUD
  # ============================================================================

  @transactions @categories @crud
  Scenario: CRUD de categorías personalizadas
    Given que el usuario de transacciones ha iniciado sesión
    And navega a la página de transacciones
    When hace clic en "Gestionar categorías"
    Then debe ver el diálogo de categorías
    And debe ver 9 categorías predeterminadas sin botones de editar o eliminar
    When añade la categoría "Categoría E2E" con tipo "Otros"
    Then debe ver la categoría "Categoría E2E" en la lista de categorías
    When cierra el diálogo de categorías
    And abre el modal de transacción y ve la categoría "Categoría E2E"
    When hace clic en "Cancelar" en el modal
    Then el diálogo debe estar cerrado
    When hace clic en "Gestionar categorías"
    Then debe ver el diálogo de categorías
    When edita la categoría "Categoría E2E" a "Categoría E2E Editada"
    Then debe ver la categoría "Categoría E2E Editada" en la lista de categorías
    When elimina la categoría "Categoría E2E Editada"
    Then la categoría "Categoría E2E Editada" no debe aparecer en la lista de categorías
    And la categoría "Categoría E2E Editada" no debe aparecer en el selector de creación

  # ============================================================================
  # CREATE - OPENING BALANCE (Fix A: crear cuenta con initialBalanceCents > 0
  # genera automáticamente una transacción INCOME "Saldo inicial" dentro del
  # mismo $transaction. Bug del usuario: antes el historial quedaba vacío y el
  # gasto fallaba con INSUFFICIENT_FUNDS falso.)
  # ============================================================================

  @transactions @create @opening-balance
  Scenario: Gasto exitoso con cuenta recién creada con saldo inicial
    Given que el usuario de transacciones ha iniciado sesión
    Given que el modal de creación está abierto
    When ingresa "Ahorros E2E" en el campo nombre
    And selecciona el tipo "Cuenta de Ahorros"
    And ingresa "300000" en el campo de saldo inicial
    And envía el formulario de creación
    Then la cuenta debe crearse exitosamente
    And la nueva cuenta debe aparecer en el grid
    When navega a la página de transacciones
    Given que el modal de transacción está abierto
    When selecciona "Gasto" como tipo
    And selecciona "Ahorros E2E" como cuenta
    And ingresa "200000" en el campo valor
    And ingresa una descripción única "Gasto saldo inicial E2E"
    And envía el formulario de creación de transacción
    Then la transacción creada debe aparecer en la tabla
    When navega a la página de cuentas
    Then la cuenta "Ahorros E2E" debe mostrar un saldo de 100000

  # ============================================================================
  # DELETE - INTEGRIDAD (no dejar saldo negativo al eliminar transacciones)
  # ============================================================================

  # NOTA sobre visibilidad: cuando deleteTransaction rechaza la operación
  # (BALANCE_NEGATIVE), DeleteTransactionModal SIEMPRE cierra el <dialog>
  # (handleClose() corre en ambas ramas de handleDelete). El toast de error
  # (ToastViewport) queda visible una vez el dialog sale del top layer — sí es
  # asertable. Además, la fila "Saldo inicial" sigue en la tabla.

  @transactions @delete @integrity
  Scenario: No se puede eliminar la transacción de apertura si deja saldo negativo
    Given que el usuario de transacciones ha iniciado sesión
    Given que el modal de creación está abierto
    When ingresa un nombre único de cuenta con prefijo "Ahorros Integridad"
    And selecciona el tipo "Cuenta de Ahorros"
    And ingresa "300000" en el campo de saldo inicial
    And envía el formulario de creación
    Then la cuenta debe crearse exitosamente
    When navega a la página de transacciones
    Given que el modal de transacción está abierto
    When selecciona "Gasto" como tipo
    And selecciona la cuenta recién creada como cuenta
    And ingresa "200000" en el campo valor
    And ingresa una descripción única "Gasto integridad saldo"
    And envía el formulario de creación de transacción
    Then la transacción creada debe aparecer en la tabla
    When hace clic en el botón de eliminar de la fila "Saldo inicial" de la cuenta recién creada
    Then debe ver el diálogo de confirmación de eliminación
    When hace clic en "Eliminar" en el diálogo de eliminación
    Then el diálogo de eliminación debe cerrarse
    And debe ver la notificación de error "No se puede eliminar: el saldo de la cuenta quedaría negativo"
    And la fila "Saldo inicial" de la cuenta recién creada debe seguir visible
