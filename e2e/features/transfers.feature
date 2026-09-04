Feature: Transferencias entre cuentas
  Como usuario autenticado de FinanceTrackerPro con al menos dos cuentas
  Quiero transferir dinero entre mis cuentas
  Para mover mi dinero sin salir de la plataforma

  # ============================================================================
  # Contexto de datos (seed: prisma/seed.e2e.ts)
  # ----------------------------------------------------------------------------
  # El usuario de transacciones (transactions@e2e.financetrackerpro.com) tiene:
  #   - "Efectivo"            (CASH,    COP) balanceCents =  50.000.000  ($500.000)
  #   - "Bancolombia Ahorros" (SAVINGS, COP) balanceCents = 150.000.000 ($1.500.000)
  # Montos de transferencia usados: 20000 (≈ $200 COP) — pequeño, no rompe nada.
  #
  # ORDEN DE EJECUCIÓN (confirmado con `npx playwright test --list`):
  #   transactions.feature corre ANTES que transfers.feature (orden alfabético
  #   "transactions" < "transfers"). Los escenarios de paginación de
  #   transactions.feature esperan "11–20 de 20 transacciones" y corren antes de
  #   que este feature añada las filas TRANSFER_OUT/TRANSFER_IN. Si este feature
  #   se ejecutara en aislamiento o antes, la paginación se rompería por +2 filas.
  #
  # Los escenarios del usuario de transacciones mutan sus saldos en el MISMO run
  # (create/edit/delete en transactions.feature), por lo que el happy path lee
  # los saldos actuales desde la BD justo antes de transferir y verifica el
  # DELTA esperado en /es/accounts (nunca saldos absolutos del seed).
  # ============================================================================

  # NOTA: No se usa Background porque playwright-bdd@8.5.1 tiene un bug donde
  # testInfo.line devuelve valores incorrectos en ejecución paralela (2 workers)
  # cuando se usa test.beforeEach, causando bddTestData not found.
  # Workaround: los pasos de login + navegación se repiten en cada escenario.

  # ============================================================================
  # HAPPY PATH - PARTIDA DOBLE
  # ============================================================================

  @transfers @happy-path
  Scenario: Transferencias: transferencia exitosa entre cuentas (partida doble)
    Given que el usuario de transacciones ha iniciado sesión
    And guarda los saldos actuales de las cuentas de transferencia
    And navega a la página de transacciones
    Then el botón "Transferir" debe estar visible
    When abre el modal de transferencia
    And selecciona "Efectivo" como cuenta origen
    And selecciona "Bancolombia Ahorros" como cuenta destino
    And ingresa "20000" en el campo valor de transferencia
    And ingresa una descripción única de transferencia "Transferencia E2E"
    And envía la transferencia
    Then el modal de transferencia debe cerrarse
    And debe ver la notificación de éxito "Transferencia realizada"
    And la fila de transferencia enviada debe aparecer con monto negativo
    And la fila de transferencia recibida debe aparecer con monto positivo
    When navega a la página de cuentas
    Then la cuenta "Efectivo" debe mostrar el saldo reducido en 20000 por la transferencia
    And la cuenta "Bancolombia Ahorros" debe mostrar el saldo incrementado en 20000 por la transferencia

  # ============================================================================
  # VALIDACIÓN - BOTÓN OCULTO CON UNA SOLA CUENTA
  # ============================================================================

  @transfers @validation
  Scenario: Transferencias: el botón Transferir no aparece con una sola cuenta
    Given que el usuario navega a la página de login en español
    When cambia a modo registro en desktop
    And ingresa "E2E Transfer Unica" en el campo nombre del registro desktop
    And ingresa un email único en el registro desktop
    And ingresa "E2ePassword123" en el campo contraseña del registro desktop
    And hace clic en "Registrarse" en el registro desktop
    And inicia sesión con el email recién registrado
    # Una sola cuenta → el botón Transferir NO se renderiza
    Given que el modal de creación está abierto
    When ingresa "Cuenta Unica Transfer" en el campo nombre
    And selecciona el tipo "Cuenta Corriente"
    And ingresa "50000" en el campo de saldo inicial
    And envía el formulario de creación
    Then la cuenta debe crearse exitosamente
    When navega a la página de transacciones
    Then el botón "Transferir" no debe estar visible
    # Segunda cuenta → el botón aparece
    When navega a la página de cuentas
    And abre el modal de nueva cuenta
    And ingresa "Segunda Cuenta Transfer" en el campo nombre
    And selecciona el tipo "Cuenta Corriente"
    And ingresa "30000" en el campo de saldo inicial
    And envía el formulario de creación
    Then la cuenta debe crearse exitosamente
    When navega a la página de transacciones
    Then el botón "Transferir" debe estar visible

  # ============================================================================
  # ERROR - FONDOS INSUFICIENTES (alerta inline, modal permanece abierto)
  # ============================================================================

  @transfers @error
  Scenario: Transferencias: transferencia con fondos insuficientes muestra error inline
    Given que el usuario de transacciones ha iniciado sesión
    And navega a la página de transacciones
    When abre el modal de transferencia
    # Origen = cuenta con MENOS saldo (Efectivo ≈ $500K vs Ahorros ≈ $1.5M)
    And selecciona "Efectivo" como cuenta origen
    And selecciona "Bancolombia Ahorros" como cuenta destino
    And ingresa "999999999" en el campo valor de transferencia
    And envía la transferencia esperando error
    Then el modal de transferencia debe permanecer abierto
    And debe ver el error "Fondos insuficientes en la cuenta seleccionada" dentro del modal de transferencia
    When hace clic en "Cancelar" en el modal de transferencia
    Then el modal de transferencia debe cerrarse

  # ============================================================================
  # VALIDACIÓN - LA CUENTA DESTINO EXCLUYE LA CUENTA ORIGEN
  # ============================================================================

  @transfers @validation
  Scenario: Transferencias: la cuenta destino excluye la cuenta origen
    Given que el usuario de transacciones ha iniciado sesión
    And navega a la página de transacciones
    When abre el modal de transferencia
    And selecciona "Efectivo" como cuenta origen
    Then las opciones del campo destino no deben incluir "Efectivo"
    And las opciones del campo destino deben incluir "Bancolombia Ahorros"
    When hace clic en "Cancelar" en el modal de transferencia
    Then el modal de transferencia debe cerrarse

  # ============================================================================
  # TRANSFERENCIAS CON BOLSILLOS (usuario pockets@e2e...)
  # ============================================================================

  @transfers @pockets
  Scenario: Transferencias: cuenta a su bolsillo mantiene el saldo total de la cuenta
    Given que el usuario de bolsillos ha iniciado sesión
    And guarda los saldos totales de las cuentas de bolsillo
    And navega a la página de transacciones
    When abre el modal de transferencia
    And selecciona "Cuenta Principal" como cuenta origen
    And selecciona "Bolsillo Viajes" como cuenta destino
    And ingresa "50000" en el campo valor de transferencia
    And ingresa una descripción única de transferencia "Cuenta a bolsillo E2E"
    And envía la transferencia
    Then el modal de transferencia debe cerrarse
    And la fila de transferencia enviada debe aparecer con monto negativo
    And la fila de transferencia recibida debe aparecer con monto positivo
    When navega a la página de cuentas
    Then la cuenta "Cuenta Principal" debe mostrar el MISMO saldo total tras la transferencia a bolsillo

  @transfers @pockets
  Scenario: Transferencias: bolsillo a su cuenta mantiene el saldo total de la cuenta
    Given que el usuario de bolsillos ha iniciado sesión
    And guarda los saldos totales de las cuentas de bolsillo
    And navega a la página de transacciones
    When abre el modal de transferencia
    And selecciona "Bolsillo Viajes" como cuenta origen
    And selecciona "Cuenta Principal" como cuenta destino
    And ingresa "30000" en el campo valor de transferencia
    And envía la transferencia
    Then el modal de transferencia debe cerrarse
    When navega a la página de cuentas
    Then la cuenta "Cuenta Principal" debe mostrar el MISMO saldo total tras la transferencia a bolsillo

  @transfers @pockets
  Scenario: Transferencias: entre bolsillos hermanos mantiene el saldo total de la cuenta
    Given que el usuario de bolsillos ha iniciado sesión
    And guarda los saldos totales de las cuentas de bolsillo
    And navega a la página de transacciones
    When abre el modal de transferencia
    And selecciona "Bolsillo Viajes" como cuenta origen
    And selecciona "Bolsillo Mercado" como cuenta destino
    And ingresa "20000" en el campo valor de transferencia
    And envía la transferencia
    Then el modal de transferencia debe cerrarse
    When navega a la página de cuentas
    Then la cuenta "Cuenta Principal" debe mostrar el MISMO saldo total tras la transferencia a bolsillo

  @transfers @pockets
  Scenario: Transferencias: un bolsillo no puede transferir a una cuenta externa
    Given que el usuario de bolsillos ha iniciado sesión
    And navega a la página de transacciones
    When abre el modal de transferencia
    And selecciona "Bolsillo Viajes" como cuenta origen
    Then las opciones del campo destino no deben incluir "Cuenta Externa"
    When hace clic en "Cancelar" en el modal de transferencia
    Then el modal de transferencia debe cerrarse