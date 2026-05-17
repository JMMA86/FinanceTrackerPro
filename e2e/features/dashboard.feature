Feature: Dashboard financiero
  Como usuario autenticado de FinanceTrackerPro
  Quiero ver mi resumen financiero completo en el dashboard
  Para tener una visión integral de mi situación financiera

  Background:
    Given que el usuario ha iniciado sesión

  # ============================================================================
  # VISUAL / CONTENIDO
  # ============================================================================

  @dashboard @visual @happy-path
  Scenario: Dashboard carga con todas las secciones visibles después del login
    Then debe ver el contenido principal del dashboard
    And debe ver la sección de Patrimonio con el label "Patrimonio"
    And debe ver las 4 tarjetas de métricas críticas
    And debe ver la sección de Liquidez expandible
    And debe ver la sección de Distribución Patrimonial
    And debe ver la sección de Transacciones Recientes

  @dashboard @visual @empty-state
  Scenario: Dashboard en estado vacío muestra valores en cero y empty states
    Then el valor de Patrimonio debe ser "$0"
    And las métricas críticas deben mostrar "$0"
    And la Distribución Patrimonial debe mostrar empty state "Sin datos"
    And las Transacciones Recientes deben mostrar empty state "Sin transacciones"

  @dashboard @visual
  Scenario: Hero card muestra net worth con label y estructura correcta
    Then el Hero card debe mostrar el label "Patrimonio"
    And debe mostrar el badge "Activo"
    And debe tener el botón de toggle de máscara

  @dashboard @visual
  Scenario: Las 4 tarjetas de métricas se muestran con sus iconos y labels
    Then debe ver el label "Efectivo Total" en las métricas
    And debe ver el label "Máximo Gastable" en las métricas
    And debe ver el label "Ahorros" en las métricas
    And debe ver el label "Deudas Totales" en las métricas

  @dashboard @visual @empty-state
  Scenario: Distribución patrimonial muestra empty state sin datos
    Then la Distribución Patrimonial debe mostrar empty state "Sin datos"
    And debe mostrar el mensaje "Agrega cuentas para ver distribución"

  @dashboard @visual @empty-state
  Scenario: Transacciones recientes muestra empty state sin transacciones
    Then las Transacciones Recientes deben mostrar empty state "Sin transacciones"
    And debe mostrar el mensaje "Comienza a registrar para verlas aquí"
    And debe mostrar el botón "Nueva Transacción" en el empty state

  # ============================================================================
  # INTERACCIÓN
  # ============================================================================

  @dashboard @interaction @mask
  Scenario: Toggle de enmascaramiento oculta los valores monetarios
    Given que ve el dashboard con valores visibles
    When hace clic en el botón de toggle de máscara
    Then los valores monetarios deben mostrar "***"
    When hace clic en el botón de toggle de máscara nuevamente
    Then los valores monetarios deben volver a mostrar valores numéricos

  @dashboard @interaction @expandable
  Scenario: Sección expandible de Liquidez se puede expandir y colapsar
    Given que la sección Liquidez comienza expandida
    When hace clic en el botón de sección "Liquidez"
    Then el contenido de Liquidez debe estar oculto
    When hace clic en el botón de sección "Liquidez" nuevamente
    Then el contenido de Liquidez debe estar visible

  @dashboard @interaction @navigation
  Scenario: Link "Ver todas" navega a la página de transacciones
    When hace clic en el enlace "Ver todas" de Transacciones Recientes
    Then debe ser redirigido a "/es/transactions"

  # ============================================================================
  # NAVEGACIÓN / LAYOUT
  # ============================================================================

  @dashboard @layout @desktop
  Scenario: Sidebar de navegación visible en desktop con enlaces principales
    Given que la pantalla es de escritorio
    Then el sidebar de navegación debe ser visible
    And el sidebar debe contener enlace a "Dashboard"
    And el sidebar debe contener enlace a "Transacciones"
    And el sidebar debe contener enlace a "Cuentas"
    And el sidebar debe contener botón de "Cerrar Sesión"

  @dashboard @layout @mobile
  Scenario: Bottom bar de navegación visible en mobile
    Given que la pantalla es de escritorio
    And que el usuario ha iniciado sesión
    And que la pantalla es móvil 390x844
    Then la barra inferior de navegación debe ser visible
    And la barra inferior debe contener enlace a "Dashboard"
    And la barra inferior debe contener enlace a "Cuentas"

  @dashboard @layout @navigation
  Scenario: Click en enlace "Cuentas" del sidebar navega a cuentas
    Given que la pantalla es de escritorio
    When hace clic en el enlace "Cuentas" del sidebar
    Then debe ser redirigido a "/es/accounts"

  @dashboard @layout @desktop
  Scenario: Dashboard marca Dashboard como activo en el sidebar
    Then el enlace "Dashboard" en el sidebar debe estar marcado como activo

  # ============================================================================
  # MULTI-IDIOMA
  # ============================================================================

  @dashboard @i18n
  Scenario: Dashboard en inglés muestra textos en inglés
    Given que la pantalla es de escritorio
    And que el usuario ha iniciado sesión en inglés
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
    When navega al dashboard
    Then el skeleton de carga debe mostrarse inicialmente
    And eventualmente debe reemplazarse con el contenido real
