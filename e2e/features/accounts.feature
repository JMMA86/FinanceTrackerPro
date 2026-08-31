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

  # NOTA sobre visibilidad (fix UX): cuando deleteBankAccount rechaza la
  # operación (ACCOUNT_HAS_BALANCE), DeleteConfirmModal AHORA cierra el <dialog>
  # en AMBAS ramas (éxito y error) — el toast de error sale del top layer del
  # dialog y SÍ es asertable en el ToastViewport (role="status"). Lo observable:
  # el modal se cierra, el toast de error aparece y la cuenta sigue en el grid.
  #
  # NOTA (nueva regla de eliminación): una cuenta con SOLO su transacción de
  # apertura (saldo inicial, sin movimientos no-apertura) SÍ se puede eliminar
  # aunque su saldo real sea != 0 (el server soft-deletea la cuenta + la(s)
  # apertura(s)). Para disparar ACCOUNT_HAS_BALANCE la cuenta debe tener
  # apertura + al menos un movimiento no-apertura (gasto) con saldo != 0.

  @accounts @delete @integrity
  Scenario: No se puede eliminar una cuenta con saldo y movimientos
    Given que el usuario de cuentas ha iniciado sesión
    And que no existen cuentas bancarias
    Given que el modal de creación está abierto
    When ingresa un nombre único de cuenta con prefijo "Cuenta Con Saldo"
    And selecciona el tipo "Cuenta Corriente"
    And ingresa "50000" en el campo de saldo inicial
    And envía el formulario de creación
    Then la cuenta debe crearse exitosamente
    And la nueva cuenta debe aparecer en el grid
    # Movimiento no-apertura: gasto de 10000 → saldo real 40000 != 0.
    When navega a la página de transacciones
    Given que el modal de transacción está abierto
    When selecciona "Gasto" como tipo
    And selecciona la cuenta recién creada como cuenta
    And ingresa "10000" en el campo valor
    And ingresa una descripción única "Gasto saldo no cero"
    And envía el formulario de creación de transacción
    Then la transacción creada debe aparecer en la tabla
    When navega a la página de cuentas
    And abre el panel de detalle de la cuenta con el nombre único
    And hace clic en eliminar en el panel de detalle
    Then debe ver el modal de confirmación "Eliminar Cuenta"
    When confirma la eliminación de la cuenta esperando rechazo
    Then el modal de confirmación de eliminación debe cerrarse
    And debe ver la notificación de error "La cuenta debe tener saldo 0 para poder eliminarla"
    When navega a la página de cuentas
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

  # NOTA (nueva regla de eliminación): una cuenta con SOLO su transacción de
  # apertura (sin movimientos no-apertura) SÍ se puede eliminar aunque su saldo
  # sea != 0. El server hace soft delete de la cuenta + de la apertura. Al
  # navegar a transacciones, la fila "Saldo inicial" de esa cuenta YA NO existe.
  # Se mantiene una cuenta PERMANENTE activa para que la tabla de transacciones
  # se renderice (si no hay cuentas activas, la página muestra el empty state).

  @accounts @delete @integrity
  Scenario: Cuenta recién creada solo con saldo inicial se puede eliminar
    Given que el usuario de cuentas ha iniciado sesión
    And que no existen cuentas bancarias
    # Cuenta que PERMANECE activa (para que la tabla de transacciones se renderice).
    Given que el modal de creación está abierto
    When ingresa un nombre único de cuenta con prefijo "Cuenta Permanente"
    And selecciona el tipo "Cuenta Corriente"
    And ingresa "100000" en el campo de saldo inicial
    And envía el formulario de creación
    Then la cuenta debe crearse exitosamente
    # Cuenta objetivo: SOLO apertura, sin gastos → con la nueva regla se puede eliminar.
    Given que el modal de creación está abierto
    When ingresa un nombre único de cuenta con prefijo "Ahorros Inicial"
    And selecciona el tipo "Cuenta de Ahorros"
    And ingresa "50000" en el campo de saldo inicial
    And envía el formulario de creación
    Then la cuenta debe crearse exitosamente
    And la nueva cuenta debe aparecer en el grid
    When abre el panel de detalle de la cuenta con el nombre único
    And hace clic en eliminar en el panel de detalle
    Then debe ver el modal de confirmación "Eliminar Cuenta"
    When confirma la eliminación de la cuenta
    Then debe ver la notificación de éxito "Cuenta eliminada"
    And la cuenta con el nombre único no debe estar en el grid
    When navega a la página de transacciones
    Then la fila "Saldo inicial" de la cuenta recién creada no debe estar visible

  # ============================================================================
  # EDITAR CUENTA
  # ============================================================================

  @accounts @edit
  Scenario: Editar una cuenta cambia nombre y tasa de interés
    Given que el usuario de cuentas ha iniciado sesión
    And que no existen cuentas bancarias
    Given que el modal de creación está abierto
    When ingresa un nombre único de cuenta con prefijo "Ahorros Editable"
    And selecciona el tipo "Cuenta de Ahorros"
    And ingresa "100000" en el campo de saldo inicial
    And envía el formulario de creación
    Then la cuenta debe crearse exitosamente
    And la nueva cuenta debe aparecer en el grid
    When abre el panel de detalle de la cuenta con el nombre único
    And hace clic en "Editar" en el panel de detalle
    Then debe ver el modal de edición con el campo "Nombre de la Cuenta"
    When cambia el nombre de la cuenta a un nombre único con prefijo "Ahorros Editada"
    And cambia la tasa de interés a "8.5"
    And guarda los cambios de la cuenta
    Then debe ver la notificación de éxito "Cuenta actualizada"
    When cierra el panel de detalle de la cuenta
    Then el grid debe mostrar la cuenta editada con el nuevo nombre
    And la tarjeta de la cuenta editada debe mostrar la tasa "8.50% EA"

  # ============================================================================
  # BOLSILLOS - CRUD DESDE EL DETALLE
  # ============================================================================

  @accounts @pockets
  Scenario: CRUD de bolsillos desde el detalle
    Given que el usuario de cuentas ha iniciado sesión
    And que no existen cuentas bancarias
    Given que el modal de creación está abierto
    When ingresa un nombre único de cuenta con prefijo "Cuenta Padre Con Bolsillos"
    And selecciona el tipo "Cuenta Corriente"
    And ingresa "50000" en el campo de saldo inicial
    And envía el formulario de creación
    Then la cuenta debe crearse exitosamente
    And la nueva cuenta debe aparecer en el grid
    When abre el panel de detalle de la cuenta con el nombre único
    And hace clic en "Agregar" en el detalle
    Then debe ver el modal de creación en modo bolsillo
    When ingresa un nombre único de bolsillo con prefijo "Bolsillo E2E"
    And ingresa "5" en la tasa de interés del bolsillo
    And envía el formulario de creación de bolsillo
    Then la cuenta debe crearse exitosamente
    And el bolsillo debe aparecer en la sección de bolsillos
    When abre el detalle del bolsillo
    Then debe ver el modal de detalle del bolsillo
    And debe ver los textos del detalle del bolsillo "Saldo actual", "Rentabilidad" y "Movimientos"
    When hace clic en "Editar bolsillo" en el detalle del bolsillo
    Then debe ver el modal de edición de bolsillo
    When cambia el nombre del bolsillo a un nombre único con prefijo "Bolsillo Editado"
    And guarda los cambios del bolsillo
    Then el modal de detalle del bolsillo debe mostrar el nuevo nombre
    When hace clic en "Eliminar bolsillo" en el detalle del bolsillo
    Then debe ver el modal de confirmación de bolsillo "Eliminar Bolsillo"
    When confirma la eliminación del bolsillo
    Then debe ver la notificación de éxito "Bolsillo eliminado"
    And el bolsillo no debe aparecer en la sección de bolsillos

  # ============================================================================
  # MOVIMIENTOS DEL DETALLE - BÚSQUEDA, FILTRO Y PAGINACIÓN
  # ============================================================================
  # AISLAMIENTO: este escenario usa el usuario de cuentas (accounts@e2e...),
  # NUNCA el usuario de transacciones. Crea su propia cuenta por la UI y siembra
  # 12 movimientos directo en la DB e2e (helper db.ts), así el usuario de
  # transacciones conserva sus 20 transacciones del seed para transactions.feature
  # (que aserta exactamente "11–20 de 20 transacciones").

  @accounts @detail
  Scenario: Movimientos del detalle filtra y pagina
    Given que el usuario de cuentas ha iniciado sesión
    And que no existen cuentas bancarias
    Given que el modal de creación está abierto
    When ingresa un nombre único de cuenta con prefijo "Cuenta Movimientos"
    And selecciona el tipo "Cuenta Corriente"
    And ingresa "0" en el campo de saldo inicial
    And envía el formulario de creación
    Then la cuenta debe crearse exitosamente
    And la nueva cuenta debe aparecer en el grid
    When siembra 12 movimientos en la cuenta recién creada
    And navega a la página de cuentas
    And abre el panel de detalle de la cuenta con el nombre único
    Then debe ver la tabla de movimientos del detalle
    And debe ver el indicador de paginación "1 / 2" en el detalle
    When escribe "nómina" en el buscador de movimientos
    Then la descripción "Ingreso de nómina 1" debe estar visible en los movimientos
    And la descripción "Gasto de supermercado 1" no debe estar visible en los movimientos
    When limpia el buscador de movimientos
    And selecciona "Gasto" en el filtro de tipo de movimientos
    Then la descripción "Ingreso de nómina 1" no debe estar visible en los movimientos
    And la descripción "Gasto de supermercado 1" debe estar visible en los movimientos
    When selecciona "Todos los tipos" en el filtro de tipo de movimientos
    And hace clic en "Siguiente" en la paginación de movimientos
    Then debe ver el indicador de paginación "2 / 2" en el detalle

  # ============================================================================
  # DETALLE EN INGLÉS
  # ============================================================================

  @accounts @i18n
  Scenario: El detalle de cuenta se muestra en inglés
    Given que el usuario de cuentas ha iniciado sesión
    And que no existen cuentas bancarias
    Given que el modal de creación está abierto
    When ingresa un nombre único de cuenta con prefijo "Cuenta Inglesa"
    And selecciona el tipo "Cuenta de Ahorros"
    And ingresa "75000" en el campo de saldo inicial
    And envía el formulario de creación
    Then la cuenta debe crearse exitosamente
    And la nueva cuenta debe aparecer en el grid
    When cambia el idioma a "English" en la página de ajustes
    And navega a la página de cuentas en inglés
    When abre el panel de detalle de la cuenta con el nombre único
    Then debe ver el detalle de la cuenta en inglés
