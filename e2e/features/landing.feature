Feature: Landing page pública bilingüe
  Como visitante de FinanceTrackerPro
  Quiero conocer el producto en mi idioma desde la landing pública
  Para entender los módulos, la seguridad y las preguntas frecuentes antes de registrarme

  # ============================================================================
  # LOCALIZACIÓN (ES / EN / redirect raíz)
  # ============================================================================

  @landing @es
  Scenario: La landing en español carga con su contenido principal
    Given que el usuario navega a la landing en español
    Then la landing debe mostrarse en español
    And debe ver las secciones de la landing
    And debe ver el CTA "Crear cuenta gratis"

  @landing @en
  Scenario: La landing en inglés carga con sus textos traducidos
    Given que el usuario navega a la landing en inglés
    Then la landing debe mostrarse en inglés
    And debe ver las secciones de la landing

  @landing @redirect
  Scenario: La raíz del sitio redirige al idioma por defecto
    When el usuario navega a la raíz del sitio
    Then la URL de la landing debe apuntar a "/es"
    And la landing debe mostrarse en español

  @landing @i18n
  Scenario: El selector de idioma de la cabecera alterna entre español e inglés
    Given que el usuario navega a la landing en español
    When cambia el idioma de la landing a "English" desde la cabecera
    Then la URL de la landing debe apuntar a "/en"
    And la landing debe mostrarse en inglés
    When cambia el idioma de la landing a "Español" desde la cabecera
    Then la URL de la landing debe apuntar a "/es"
    And la landing debe mostrarse en español

  # ============================================================================
  # NAVEGACIÓN POR ANCLAS Y CTA
  # ============================================================================

  @landing @anchors
  Scenario: El ancla de la cabecera deja la sección bajo el header sticky
    Given que el usuario navega a la landing en español
    When hace clic en el ancla "Módulos" de la cabecera
    Then la URL de la landing debe terminar en "#features"
    And el borde superior de la sección "features" debe quedar bajo el header sticky

  @landing @cta
  Scenario: Los CTA de la cabecera llevan a registro y login
    Given que el usuario navega a la landing en español
    When hace clic en el CTA "Crear cuenta" de la cabecera
    Then la URL de la landing debe apuntar a "/es/register"
    When vuelve a la landing en español
    And hace clic en el CTA "Iniciar sesión" de la cabecera
    Then la URL de la landing debe apuntar a "/es/login"

  # ============================================================================
  # FAQ Y MENÚ MÓVIL
  # ============================================================================

  @landing @faq
  Scenario: Abrir una pregunta del FAQ muestra su respuesta
    Given que el usuario navega a la landing en español
    When abre la primera pregunta del FAQ
    Then la primera pregunta del FAQ debe mostrar su respuesta

  @landing @mobile
  Scenario: El menú móvil navega a una ancla y se cierra
    Given que la pantalla es móvil 390x844
    And que el usuario navega a la landing en español
    When abre el menú de navegación móvil
    And hace clic en el ancla "Preguntas" de la cabecera
    Then la URL de la landing debe terminar en "#faq"
    And el menú de navegación móvil debe estar cerrado
    And el borde superior de la sección "faq" debe quedar bajo el header sticky
