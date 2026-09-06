Feature: Gestión de Tarjetas de Crédito
  Como usuario autenticado de FinanceTrackerPro
  Quiero gestionar mis tarjetas de crédito
  Para controlar mi deuda, realizar consumos y pagar mis tarjetas

  # NOTA: No se usa Background porque playwright-bdd@8.5.1 tiene un bug donde
  # testInfo.line devuelve valores incorrectos en ejecución paralela (2 workers)
  # cuando se usa test.beforeEach, causando bddTestData not found.
  # Workaround: los pasos de login + navegación se repiten en cada escenario.

  # ============================================================================
  # Contexto de datos (seed: prisma/seed.e2e.ts)
  # ----------------------------------------------------------------------------
  # El usuario de tarjetas (cards@e2e.financetrackerpro.com) tiene:
  #   - "Cuenta Corriente"  (CHECKING, COP) balanceCents = 200.000.000  ($2.000.000)
  #   - "Cuenta de Ahorros" (SAVINGS,  COP) balanceCents = 100.000.000  ($1.000.000)
  #   - "Visa E2E"       (CREDIT_CARD, VISA,       COP) debt = 150.000   limit = 1.000.000
  #   - "Mastercard E2E" (CREDIT_CARD, MASTERCARD, COP) debt = 0         limit =   800.000
  # Deuda mostrada = |balanceCents|; Disponible = limit - debt.
  #
  # IMPORTANTE: las tarjetas del seed NUNCA se mutan. Los escenarios que
  # consumen/pagan/eliminan crean su propia tarjeta por la UI con nombre único
  # (timestamp), de modo que las aserciones deterministas del seed se mantienen
  # estables durante todo el run.
  # ============================================================================

  # ============================================================================
  # VISUAL / CONTENIDO
  # ============================================================================

  @credit-cards @visual @seed
  Scenario: La sección de tarjetas muestra las tarjetas del seed con deuda y disponible
    Given que el usuario de tarjetas ha iniciado sesión
    When navega a la página de cuentas
    Then debe ver la sección "Tarjetas de Crédito"
    And la tarjeta "Visa E2E" debe mostrar deuda "1.500,00" y disponible "8.500,00"
    And la tarjeta "Mastercard E2E" debe mostrar deuda "0,00" y disponible "8.000,00"

  @credit-cards @navigation
  Scenario: La ruta /credit-cards redirige a /accounts
    Given que el usuario de tarjetas ha iniciado sesión
    When navega a la página de tarjetas antigua
    Then debe ser redirigido a la página de cuentas

  # ============================================================================
  # CREAR TARJETA
  # ============================================================================

  @credit-cards @create @happy-path
  Scenario: Crear una tarjeta de crédito con deuda 0 y disponible igual al límite
    Given que el usuario de tarjetas ha iniciado sesión
    When navega a la página de cuentas
    And abre el modal de nueva tarjeta
    And ingresa un nombre único de tarjeta con prefijo "Tarjeta Nueva"
    And ingresa "1000000" en el campo límite de crédito
    And ingresa "5" en el campo día de corte
    And ingresa "20" en el campo día de pago
    And selecciona la red "Visa"
    And envía el formulario de creación de tarjeta
    Then la tarjeta debe crearse exitosamente
    And la tarjeta recién creada debe mostrar deuda "0,00" y disponible "10.000,00"

  # ============================================================================
  # CONSUMO EN TARJETA (EXPENSE)
  # ============================================================================

  @credit-cards @consume @happy-path
  Scenario: Consumo en tarjeta desde Transacciones aumenta la deuda
    Given que el usuario de tarjetas ha iniciado sesión
    When navega a la página de cuentas
    And abre el modal de nueva tarjeta
    And ingresa un nombre único de tarjeta con prefijo "Tarjeta Consumo"
    And ingresa "1000000" en el campo límite de crédito
    And ingresa "5" en el campo día de corte
    And ingresa "20" en el campo día de pago
    And envía el formulario de creación de tarjeta
    Then la tarjeta debe crearse exitosamente
    When navega a la página de transacciones
    And abre el modal de nueva transacción
    And selecciona "Gasto" como tipo
    And selecciona la tarjeta recién creada como cuenta
    And ingresa "100000" en el campo valor
    And ingresa una descripción única "Consumo tarjeta E2E"
    And envía el formulario de creación de transacción
    Then la transacción creada debe aparecer en la tabla como gasto negativo
    When navega a la página de cuentas
    And abre el detalle de la tarjeta recién creada
    Then el detalle de tarjeta debe mostrar la deuda actual "1.000,00"

  # NOTA (hallazgo de exploración): el cliente (CreateTransactionModal) bloquea
  # el ingreso de montos que superen el crédito disponible (maxValue =
  # availableCredit + reset a 0 al cambiar de cuenta). Por ello el error de
  # servidor CREDIT_LIMIT_EXCEEDED ("No tienes suficiente crédito disponible en
  # esta tarjeta") NO es alcanzable por tipeo normal en la UI — la defensa en
  # profundidad ya actúa del lado del cliente. El escenario verifica el
  # comportamiento real: el campo no acepta el monto que excede el límite y no
  # se registra ningún consumo sobre el límite.

  @credit-cards @consume @limit
  Scenario: No se puede consumir sobre el límite de crédito disponible
    Given que el usuario de tarjetas ha iniciado sesión
    When navega a la página de cuentas
    And abre el modal de nueva tarjeta
    And ingresa un nombre único de tarjeta con prefijo "Tarjeta Límite"
    And ingresa "500000" en el campo límite de crédito
    And ingresa "5" en el campo día de corte
    And ingresa "20" en el campo día de pago
    And envía el formulario de creación de tarjeta
    Then la tarjeta debe crearse exitosamente
    When navega a la página de transacciones
    And abre el modal de nueva transacción
    And selecciona "Gasto" como tipo
    And selecciona la tarjeta recién creada como cuenta
    When intenta ingresar "600000" en el campo valor de la tarjeta
    Then el campo valor no debe aceptar el monto que excede el crédito disponible
    When cierra el modal de transacción con Cancelar
    Then la tarjeta recién creada no debe registrar consumos

  # ============================================================================
  # TARJETAS SOLO EN GASTOS (no en INGRESOS)
  # ============================================================================

  @credit-cards @transactions @income
  Scenario: Las tarjetas de crédito no aparecen como cuenta en transacciones de Ingreso
    Given que el usuario de tarjetas ha iniciado sesión
    And navega a la página de transacciones
    Given que el modal de transacción está abierto
    When selecciona "Ingreso" como tipo
    And abre el selector de cuenta
    Then el selector de cuenta no debe mostrar el grupo "Tarjetas de Crédito"
    And el selector de cuenta debe mostrar el grupo "Cuentas"

  # ============================================================================
  # PAGAR TARJETA DESDE TRANSACCIONES
  # ============================================================================

  @credit-cards @pay @happy-path
  Scenario: Pagar tarjeta desde Transacciones registra un CREDIT_PAYMENT positivo y reduce la deuda
    Given que el usuario de tarjetas ha iniciado sesión
    When navega a la página de cuentas
    And abre el modal de nueva tarjeta
    And ingresa un nombre único de tarjeta con prefijo "Tarjeta Pago"
    And ingresa "1000000" en el campo límite de crédito
    And ingresa "5" en el campo día de corte
    And ingresa "20" en el campo día de pago
    And envía el formulario de creación de tarjeta
    Then la tarjeta debe crearse exitosamente
    When navega a la página de transacciones
    And abre el modal de nueva transacción
    And selecciona "Gasto" como tipo
    And selecciona la tarjeta recién creada como cuenta
    And ingresa "200000" en el campo valor
    And ingresa una descripción única "Consumo a pagar E2E"
    And envía el formulario de creación de transacción
    Then la transacción creada debe aparecer en la tabla
    When hace clic en "Pagar Tarjeta"
    Then el modal de pagar tarjeta debe estar visible
    When selecciona la tarjeta recién creada en el modal de pago
    And selecciona "Cuenta Corriente" como cuenta de origen
    And ingresa "50000" en el campo monto a pagar
    And confirma el pago de la tarjeta
    Then el modal de pagar tarjeta debe cerrarse
    And debe ver la fila de pago de tarjeta con monto positivo
    When navega a la página de cuentas
    Then la tarjeta recién creada debe mostrar deuda "1.500,00" y disponible "8.500,00"

  @credit-cards @pay @no-debt
  Scenario: Pagar Tarjeta con todas las tarjetas sin deuda muestra aviso y no abre el modal
    Given que el usuario navega a la página de login en español
    When cambia a modo registro en desktop
    And ingresa "E2E Tarjetas Sin Deuda" en el campo nombre del registro desktop
    And ingresa un email único en el registro desktop
    And ingresa "E2ePassword123" en el campo contraseña del registro desktop
    And hace clic en "Registrarse" en el registro desktop
    And inicia sesión con el email recién registrado
    # Una cuenta bancaria (fondos) + una tarjeta sin deuda → el botón aparece.
    Given que el modal de creación está abierto
    When ingresa "Cuenta Sin Deuda" en el campo nombre
    And selecciona el tipo "Cuenta Corriente"
    And ingresa "50000" en el campo de saldo inicial
    And envía el formulario de creación
    Then la cuenta debe crearse exitosamente
    When navega a la página de cuentas
    And abre el modal de nueva tarjeta
    And ingresa un nombre único de tarjeta con prefijo "Tarjeta Sin Deuda"
    And ingresa "300000" en el campo límite de crédito
    And ingresa "8" en el campo día de corte
    And ingresa "22" en el campo día de pago
    And envía el formulario de creación de tarjeta
    Then la tarjeta debe crearse exitosamente
    When navega a la página de transacciones
    Then el botón "Pagar Tarjeta" debe estar visible
    When hace clic en "Pagar Tarjeta"
    Then debe ver la notificación "Actualmente no tienes deudas por pagar"
    And no debe abrirse el modal de pagar tarjeta

  # ============================================================================
  # PAGAR TARJETA DESDE EL DETALLE EN ACCOUNTS
  # ============================================================================

  @credit-cards @pay @detail
  Scenario: Pagar tarjeta desde el detalle en Accounts reduce la deuda
    Given que el usuario de tarjetas ha iniciado sesión
    When navega a la página de cuentas
    And abre el modal de nueva tarjeta
    And ingresa un nombre único de tarjeta con prefijo "Tarjeta Detalle"
    And ingresa "1000000" en el campo límite de crédito
    And ingresa "5" en el campo día de corte
    And ingresa "20" en el campo día de pago
    And envía el formulario de creación de tarjeta
    Then la tarjeta debe crearse exitosamente
    When navega a la página de transacciones
    And abre el modal de nueva transacción
    And selecciona "Gasto" como tipo
    And selecciona la tarjeta recién creada como cuenta
    And ingresa "300000" en el campo valor
    And ingresa una descripción única "Consumo detalle E2E"
    And envía el formulario de creación de transacción
    Then la transacción creada debe aparecer en la tabla
    When navega a la página de cuentas
    And abre el detalle de la tarjeta recién creada
    Then el detalle de tarjeta debe mostrar la deuda actual "3.000,00"
    When hace clic en "Pagar" en el detalle de la tarjeta
    Then el modal de pagar tarjeta debe estar visible
    When selecciona la tarjeta recién creada en el modal de pago
    And selecciona "Cuenta de Ahorros" como cuenta de origen
    And ingresa "100000" en el campo monto a pagar
    And confirma el pago de la tarjeta
    Then el modal de pagar tarjeta debe cerrarse
    When navega a la página de cuentas
    Then la tarjeta recién creada debe mostrar deuda "2.000,00" y disponible "8.000,00"

  # ============================================================================
  # EDITAR TARJETA
  # ============================================================================

  @credit-cards @edit
  Scenario: Editar una tarjeta cambia nombre, límite y días
    Given que el usuario de tarjetas ha iniciado sesión
    When navega a la página de cuentas
    And abre el modal de nueva tarjeta
    And ingresa un nombre único de tarjeta con prefijo "Tarjeta Editable"
    And ingresa "600000" en el campo límite de crédito
    And ingresa "5" en el campo día de corte
    And ingresa "20" en el campo día de pago
    And envía el formulario de creación de tarjeta
    Then la tarjeta debe crearse exitosamente
    When abre el detalle de la tarjeta recién creada
    And hace clic en "Editar" en el detalle de la tarjeta
    Then debe ver el modal de edición de tarjeta
    When cambia el nombre de la tarjeta a un nombre único con prefijo "Tarjeta Editada"
    And ingresa "700000" en el campo límite de crédito del modal de edición
    And ingresa "12" en el campo día de corte del modal de edición
    And ingresa "28" en el campo día de pago del modal de edición
    And guarda los cambios de la tarjeta
    Then el modal de edición de tarjeta debe cerrarse
    When cierra el detalle de la tarjeta
    Then el grid debe mostrar la tarjeta editada con el nuevo nombre
    And la tarjeta editada debe mostrar disponible "7.000,00"

  # ============================================================================
  # ELIMINAR TARJETA - REGLAS DE INTEGRIDAD
  # ============================================================================

  @credit-cards @delete @integrity
  Scenario: No se puede eliminar una tarjeta con deuda pendiente
    Given que el usuario de tarjetas ha iniciado sesión
    When navega a la página de cuentas
    And abre el modal de nueva tarjeta
    And ingresa un nombre único de tarjeta con prefijo "Tarjeta Bloqueada"
    And ingresa "400000" en el campo límite de crédito
    And ingresa "5" en el campo día de corte
    And ingresa "20" en el campo día de pago
    And envía el formulario de creación de tarjeta
    Then la tarjeta debe crearse exitosamente
    When navega a la página de transacciones
    And abre el modal de nueva transacción
    And selecciona "Gasto" como tipo
    And selecciona la tarjeta recién creada como cuenta
    And ingresa "50000" en el campo valor
    And ingresa una descripción única "Deuda para borrar E2E"
    And envía el formulario de creación de transacción
    Then la transacción creada debe aparecer en la tabla
    When navega a la página de cuentas
    And abre el detalle de la tarjeta recién creada
    And hace clic en eliminar en el detalle de la tarjeta
    Then debe ver el modal de confirmación de tarjeta "Eliminar Tarjeta"
    When confirma la eliminación de la tarjeta esperando rechazo
    Then debe ver el error "Esta tarjeta tiene deuda pendiente. Paga el saldo antes de eliminarla." dentro del modal de confirmación de tarjeta
    When cierra el modal de confirmación de tarjeta
    And cierra el detalle de la tarjeta
    Then la tarjeta recién creada debe seguir en el grid

  @credit-cards @delete @integrity
  Scenario: Eliminar una tarjeta sin deuda la remueve del grid
    Given que el usuario de tarjetas ha iniciado sesión
    When navega a la página de cuentas
    And abre el modal de nueva tarjeta
    And ingresa un nombre único de tarjeta con prefijo "Tarjeta Eliminable"
    And ingresa "600000" en el campo límite de crédito
    And ingresa "5" en el campo día de corte
    And ingresa "20" en el campo día de pago
    And envía el formulario de creación de tarjeta
    Then la tarjeta debe crearse exitosamente
    When navega a la página de transacciones
    And abre el modal de nueva transacción
    And selecciona "Gasto" como tipo
    And selecciona la tarjeta recién creada como cuenta
    And ingresa "100000" en el campo valor
    And ingresa una descripción única "Deuda para pagar E2E"
    And envía el formulario de creación de transacción
    Then la transacción creada debe aparecer en la tabla
    # Pagar el 100% de la deuda → la tarjeta queda sin deuda y se puede eliminar.
    When hace clic en "Pagar Tarjeta"
    Then el modal de pagar tarjeta debe estar visible
    When selecciona la tarjeta recién creada en el modal de pago
    And selecciona "Cuenta Corriente" como cuenta de origen
    And ingresa "100000" en el campo monto a pagar
    And confirma el pago de la tarjeta
    Then el modal de pagar tarjeta debe cerrarse
    When navega a la página de cuentas
    And abre el detalle de la tarjeta recién creada
    And hace clic en eliminar en el detalle de la tarjeta
    Then debe ver el modal de confirmación de tarjeta "Eliminar Tarjeta"
    When confirma la eliminación de la tarjeta
    Then la tarjeta recién creada no debe estar en el grid

  # ============================================================================
  # TRANSFERENCIAS - LAS TARJETAS NO SON ORIGEN NI DESTINO
  # ============================================================================

  @credit-cards @transfer @validation
  Scenario: Las tarjetas de crédito no aparecen como origen ni destino en Transferencias
    Given que el usuario de tarjetas ha iniciado sesión
    And navega a la página de transacciones
    When abre el modal de transferencia
    Then las opciones del campo origen no deben incluir "Visa E2E"
    And las opciones del campo origen no deben incluir "Mastercard E2E"
    When selecciona "Cuenta Corriente" como cuenta origen
    Then las opciones del campo destino no deben incluir "Visa E2E"
    And las opciones del campo destino no deben incluir "Mastercard E2E"
    When hace clic en "Cancelar" en el modal de transferencia
    Then el modal de transferencia debe cerrarse