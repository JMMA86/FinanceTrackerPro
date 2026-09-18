Feature: Ingresos y primas en Ajustes
  Como usuario autenticado de FinanceTrackerPro
  Quiero configurar mi sueldo, mis primas y mi meta mensual de ahorro
  Para que la proyección de fin de período refleje mi realidad

  # El usuario del dashboard tiene una configuración sembrada (quincenal, días
  # 15 y 30, prima semestral y meta mensual de ahorro) y se usa para verificar la
  # lectura persistida. El usuario de cuentas está aislado de la proyección y del
  # prefill de transacciones, así que se usa para los escenarios de escritura.

  @settings @salary @visual
  Scenario: La sección de ingresos muestra la configuración guardada
    Given que el usuario del dashboard ha iniciado sesión
    When navega a la página de ajustes
    Then debe ver la sección "Ingresos y primas"
    And la frecuencia de sueldo debe ser "Quincenal"
    And los días de pago del sueldo deben ser "15" y "30"
    And el monto de sueldo configurado debe ser 500000000 centavos
    And la prima "Prima de servicios" debe estar listada
    And la meta de ahorro configurada debe ser 50000000 centavos

  @settings @salary @persistence
  Scenario: Guardar sueldo, prima y meta los conserva tras recargar
    Given que el usuario de cuentas ha iniciado sesión
    When navega a la página de ajustes
    And configura un sueldo "Mensual" con día de pago "10" y monto de 150000000 centavos
    And añade una prima única con monto de 50000000 centavos y frecuencia "Anual" en el mes "Diciembre"
    And guarda la configuración de ingresos
    Then debe ver la confirmación "Ingresos guardados correctamente."
    When configura la meta de ahorro mensual en 25000000 centavos
    And guarda la meta de ahorro
    Then debe ver la confirmación "Meta de ahorro guardada correctamente."
    When recarga la página de ajustes
    Then la frecuencia de sueldo debe ser "Mensual"
    And el día de pago del sueldo debe ser "10"
    And el monto de sueldo configurado debe ser 150000000 centavos
    And la prima única debe estar listada
    And la meta de ahorro configurada debe ser 25000000 centavos
