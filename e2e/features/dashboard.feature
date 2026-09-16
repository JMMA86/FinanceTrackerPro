Feature: Dashboard financiero
  Como usuario autenticado de FinanceTrackerPro
  Quiero ver mi resumen financiero completo en el dashboard
  Para tener una visión integral de mi situación financiera

  # El usuario "con datos" está sembrado con 3 cuentas de activo, 1 tarjeta con
  # deuda y 1 préstamo por cobrar + 1 por pagar (todo COP), de modo que la nueva
  # "Distribución Patrimonial" (Opción A) renderiza donut y listas no vacías.
  # El usuario "sin datos" está aislado para cubrir los estados vacíos.

  # ============================================================================
  # VISUAL / CONTENIDO (usuario con datos)
  # ============================================================================

  @dashboard @visual @happy-path
  Scenario: Dashboard carga con todas las secciones visibles después del login
    Given que el usuario del dashboard ha iniciado sesión
    Then debe ver el contenido principal del dashboard
    And debe ver la sección de Patrimonio con el label "Patrimonio"
    And debe ver las 4 tarjetas de métricas críticas
    And debe ver la sección de Liquidez expandible
    And debe ver las secciones expandibles del dashboard
    And debe ver la sección de Distribución Patrimonial
    And debe ver la sección de Transacciones Recientes

  @dashboard @visual @alerts
  Scenario: La región de alertas muestra avisos con enlaces accionables
    Given que el usuario del dashboard ha iniciado sesión
    Then debe ver la región de alertas "Alertas"
    And la alerta de préstamos debe enlazar a la página de préstamos

  @dashboard @visual
  Scenario: Hero card muestra net worth con label y estructura correcta
    Given que el usuario del dashboard ha iniciado sesión
    Then el Hero card debe mostrar el label "Patrimonio"
    And debe mostrar el badge "Activo"
    And debe tener el botón de toggle de máscara

  @dashboard @visual
  Scenario: Las 4 tarjetas de métricas se muestran con sus iconos y labels
    Given que el usuario del dashboard ha iniciado sesión
    Then debe ver el label "Efectivo Total" en las métricas
    And debe ver el label "Máximo Gastable" en las métricas
    And debe ver el label "Ahorros" en las métricas
    And debe ver el label "Deudas Totales" en las métricas

  @dashboard @visual @quick-actions
  Scenario: Acciones rápidas muestra los accesos principales
    Given que el usuario del dashboard ha iniciado sesión
    Then debe ver el botón "Nueva Transacción" en Acciones rápidas
    And debe ver el botón "Registrar gasto" en Acciones rápidas
    And debe ver el botón "Transferir" en Acciones rápidas
    And debe ver el botón "Pagar tarjeta" en Acciones rápidas
    And debe ver el enlace "Aportar a ahorro" en Acciones rápidas
    And debe ver el enlace "Préstamos" en Acciones rápidas

  @dashboard @interaction @quick-actions
  Scenario: "Nueva Transacción" abre el modal de creación
    Given que el usuario del dashboard ha iniciado sesión
    When hace clic en el botón "Nueva Transacción" de Acciones rápidas
    Then debe estar visible el modal "Crear transacción"

  @dashboard @interaction @quick-actions
  Scenario: "Transferir" abre el modal de transferencia
    Given que el usuario del dashboard ha iniciado sesión
    When hace clic en el botón "Transferir" de Acciones rápidas
    Then debe estar visible el modal "Transferir entre cuentas"

  @dashboard @interaction @quick-actions
  Scenario: "Pagar tarjeta" abre el modal de pago de tarjeta
    Given que el usuario del dashboard ha iniciado sesión
    When hace clic en el botón "Pagar tarjeta" de Acciones rápidas
    Then debe estar visible el modal "Pagar Tarjeta"

  # ============================================================================
  # DISTRIBUCIÓN PATRIMONIAL (Opción A)
  # ============================================================================

  @dashboard @visual @distribution
  Scenario: El donut de distribución expone el total de activos
    Given que el usuario del dashboard ha iniciado sesión
    Then el donut de Distribución Patrimonial debe exponer el total de activos en su aria-label
    And el centro del donut debe mostrar "Total de activos"

  @dashboard @visual @distribution
  Scenario: Las listas de Activos y Pasivos renderizan sus categorías
    Given que el usuario del dashboard ha iniciado sesión
    Then debe ver la lista "Activos" con la categoría "Cuentas por Cobrar"
    And debe ver la lista "Activos" con la categoría "Ahorros"
    And debe ver la lista "Activos" con la categoría "Efectivo"
    And debe ver la lista "Pasivos" con la categoría "Tarjetas de Crédito"
    And debe ver la lista "Pasivos" con la categoría "Préstamos por pagar"

  @dashboard @visual @distribution
  Scenario: El resumen de distribución muestra los totales y la nota explicativa
    Given que el usuario del dashboard ha iniciado sesión
    Then debe ver el resumen de Distribución Patrimonial con sus totales
    And debe ver la nota de distribución
    And debe ver la nota de conversión a moneda base con "COP"

  @dashboard @visual @distribution
  Scenario: El Patrimonio del panel de distribución coincide con el del hero
    Given que el usuario del dashboard ha iniciado sesión
    Then el Patrimonio del panel de Distribución Patrimonial debe coincidir con el del hero

  @dashboard @visual @distribution
  Scenario: La leyenda interna del pastel ya no se renderiza
    Given que el usuario del dashboard ha iniciado sesión
    Then no debe existir la leyenda interna del pastel de distribución

  # ============================================================================
  # INTERACCIÓN
  # ============================================================================

  @dashboard @interaction @mask
  Scenario: Toggle de enmascaramiento oculta los valores monetarios
    Given que el usuario del dashboard ha iniciado sesión
    Given que ve el dashboard con valores visibles
    When hace clic en el botón de toggle de máscara
    Then los valores monetarios deben mostrar "***"
    When hace clic en el botón de toggle de máscara nuevamente
    Then los valores monetarios deben volver a mostrar valores numéricos

  @dashboard @interaction @expandable
  Scenario: Sección expandible de Liquidez se puede expandir y colapsar
    Given que el usuario del dashboard ha iniciado sesión
    Given que la sección Liquidez comienza expandida
    When hace clic en el botón de sección "Liquidez"
    Then el contenido de Liquidez debe estar oculto
    When hace clic en el botón de sección "Liquidez" nuevamente
    Then el contenido de Liquidez debe estar visible

  @dashboard @interaction @navigation
  Scenario: Link "Ver todas" navega a la página de transacciones
    Given que el usuario del dashboard ha iniciado sesión
    When hace clic en el enlace "Ver todas" de Transacciones Recientes
    Then debe ser redirigido a "/es/transactions"

  # ============================================================================
  # NAVEGACIÓN / LAYOUT
  # ============================================================================

  @dashboard @layout @desktop
  Scenario: Sidebar de navegación visible en desktop con enlaces principales
    Given que el usuario del dashboard ha iniciado sesión
    Given que la pantalla es de escritorio
    Then el sidebar de navegación debe ser visible
    And el sidebar debe contener enlace a "Dashboard"
    And el sidebar debe contener enlace a "Transacciones"
    And el sidebar debe contener enlace a "Cuentas"
    And el sidebar debe contener botón de "Cerrar Sesión"

  @dashboard @layout @mobile
  Scenario: Bottom bar de navegación visible en mobile
    Given que el usuario del dashboard ha iniciado sesión
    And que la pantalla es móvil 390x844
    Then la barra inferior de navegación debe ser visible
    And la barra inferior debe contener enlace a "Dashboard"
    And la barra inferior debe contener enlace a "Cuentas"

  @dashboard @layout @navigation
  Scenario: Click en enlace "Cuentas" del sidebar navega a cuentas
    Given que el usuario del dashboard ha iniciado sesión
    Given que la pantalla es de escritorio
    When hace clic en el enlace "Cuentas" del sidebar
    Then debe ser redirigido a "/es/accounts"

  @dashboard @layout @desktop
  Scenario: Dashboard marca Dashboard como activo en el sidebar
    Given que el usuario del dashboard ha iniciado sesión
    Then el enlace "Dashboard" en el sidebar debe estar marcado como activo

  # ============================================================================
  # ESTADO VACÍO (usuario sin cuentas / préstamos)
  # ============================================================================

  @dashboard @visual @empty-state
  Scenario: Dashboard sin datos muestra valores en cero y empty states
    Given que el usuario del dashboard sin datos ha iniciado sesión
    Then el valor de Patrimonio debe ser "$0"
    And las métricas críticas deben mostrar "$0"
    And la Distribución Patrimonial debe mostrar empty state "Sin datos"
    And debe mostrar el mensaje "Agrega cuentas para ver distribución"
    And las Transacciones Recientes deben mostrar empty state "Sin transacciones"
    And debe mostrar el mensaje "Comienza a registrar para verlas aquí"
    And debe mostrar el botón "Nueva Transacción" en el empty state

  @dashboard @visual @distribution @empty-state
  Scenario: Distribución patrimonial sin datos no muestra donut ni listas
    Given que el usuario del dashboard sin datos ha iniciado sesión
    Then la Distribución Patrimonial debe mostrar empty state "Sin datos"
    And no debe existir ningún donut de distribución
    And no debe existir la lista "Activos"

  # ============================================================================
  # MULTI-IDIOMA (usuario vacío, para que los empty state labels sean estables)
  # ============================================================================

  @dashboard @i18n @empty-state
  Scenario: Dashboard en inglés muestra textos en inglés
    Given que el usuario del dashboard sin datos ha iniciado sesión en inglés
    Then debe ver el contenido principal del dashboard
    And debe ver el label "Net Worth" en el dashboard
    And debe ver el label "Total Cash" en las métricas
    And la Distribución Patrimonial debe mostrar empty state "No Data"
    And las Transacciones Recientes deben mostrar empty state "No Transactions"

  # ============================================================================
  # LOADING / SKELETON
  # ============================================================================

  @dashboard @loading @skeleton
  Scenario: Skeleton loading se muestra durante la carga inicial
    Given que el usuario del dashboard ha iniciado sesión
    When navega al dashboard
    Then el skeleton de carga debe mostrarse inicialmente
    And eventualmente debe reemplazarse con el contenido real
