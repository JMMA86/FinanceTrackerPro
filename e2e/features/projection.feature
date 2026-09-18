Feature: Proyección de fin de período
  Como usuario autenticado de FinanceTrackerPro
  Quiero ver cómo cerrará mi mes y mi año con lo que ya está registrado
  Para anticipar mi disponible, mi superávit y el estado de mi sueldo

  # Usuarios y datos (seed + arreglo en la BD e2e):
  #  - "Dashboard E2E User": sueldo quincenal (días 15 y 30), prima semestral,
  #    meta mensual de ahorro, 3 cuentas, 1 tarjeta con deuda, 1 préstamo por
  #    cobrar y 1 por pagar (ambos con cuotas ya vencidas). Es el usuario base de
  #    los escenarios de estructura, estado del salario y desglose.
  #  - "Investments E2E User": se le organiza un sueldo mensual y una cuenta de
  #    inversión en USD respaldada por el ledger con una tasa almacenada, para
  #    cubrir la línea "Inversiones a valor de mercado" y su nota de tasa.
  #  - "Variable Expenses E2E User": se le organiza un sueldo mensual para cubrir
  #    la línea "Estimación de gastos variables" (sus definiciones ya están
  #    sembradas).
  #
  # El bloque "Estado del salario" es un desplegable INDEPENDIENTE del desglose
  # "¿Cómo se calculó?" y arranca CERRADO en cada tarjeta.

  @projection @visual
  Scenario: La proyección muestra las tarjetas de Mes y Año
    Given que el usuario del dashboard ha iniciado sesión
    Then debe ver la sección de proyección "Proyección de fin de período"
    And la proyección debe mostrar las tarjetas "Este mes" y "Este año"
    And cada tarjeta de proyección debe mostrar su cierre proyectado y su disponible restante

  @projection @salary @interaction
  Scenario: El estado del salario es un desplegable cerrado por defecto
    Given que el usuario del dashboard ha iniciado sesión
    Then el bloque "Estado del salario" de "Este mes" debe estar cerrado
    When abre el detalle del salario de "Este mes"
    Then el bloque "Estado del salario" de "Este mes" debe estar abierto
    And el detalle del salario de "Este mes" debe mostrar "Recibido" y "Por recibir"

  @projection @breakdown
  Scenario: El desglose del mes explica el cálculo con sus líneas
    Given que el usuario del dashboard ha iniciado sesión
    When abre el desglose de la proyección de "Este mes"
    Then el desglose de "Este mes" debe incluir las líneas:
      | Efectivo disponible hoy |
      | Sueldo pendiente del período |
      | Capital de préstamos por pagar |
      | Intereses de préstamos por pagar |
      | Meta de ahorro del período |

  @projection @breakdown @receivable
  Scenario: El desglose del año cuenta solo los cobros futuros de préstamos por cobrar
    Given que el usuario del dashboard ha iniciado sesión
    When abre el desglose de la proyección de "Este año"
    Then el desglose de "Este año" debe incluir el capital y el interés de préstamos por cobrar
    And el desglose de "Este año" debe contar solo los cobros futuros del préstamo por cobrar

  @projection @breakdown @investments
  Scenario: El desglose incluye las inversiones a valor de mercado con su tasa aplicada
    Given que el usuario de inversiones con sueldo proyectable ha iniciado sesión
    When abre el desglose de la proyección de "Este mes"
    Then el desglose de "Este mes" debe incluir las inversiones a valor de mercado con su tasa aplicada

  @projection @breakdown @variable-expenses
  Scenario: El desglose incluye la estimación de gastos variables
    Given que el usuario de gastos variables con sueldo proyectable ha iniciado sesión
    When abre el desglose de la proyección de "Este mes"
    Then el desglose de "Este mes" debe incluir la estimación de gastos variables
