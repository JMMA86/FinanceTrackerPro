Feature: Onboarding de primer uso
  Como usuario nuevo de FinanceTrackerPro
  Quiero completar el recorrido guiado de configuración inicial
  Para entender los módulos clave y configurar mi primera cuenta

  # Los usuarios onboarding1..3 se siembran SIN completar el onboarding
  # (prisma/seed.e2e.ts) para poder recorrer el walkthrough real. Los escenarios
  # que terminan el flujo (account/finish/skip) usan un usuario distinto cada uno
  # para no interferir entre sí; los escenarios de solo lectura reutilizan esos
  # mismos usuarios antes de que completen el onboarding (orden del archivo).
  #
  # Nota: el tag es @skip-flow (no @skip) porque Playwright reserva "@skip" y
  # generaría el escenario como test.skip automáticamente.

  Background:
    Given que las animaciones del onboarding están reducidas

  # ============================================================================
  # REDIRECT / GUARD
  # ============================================================================

  @onboarding @redirect
  Scenario: Un usuario sin onboarding es enviado al onboarding al iniciar sesión
    When inicia sesión por primera vez el usuario de onboarding "1"
    Then debe estar en el onboarding en español
    And debe ver el contador de progreso "Paso 1 de 4"

  @onboarding @guard
  Scenario: Un usuario ya onboardeado entra directo al dashboard
    Given que el usuario de autenticación ya completó el onboarding
    Then debe estar en el dashboard en español
    And no debe ver el recorrido de onboarding

  # ============================================================================
  # PASO 1 — BIENVENIDA E IDIOMA
  # ============================================================================

  @onboarding @welcome
  Scenario: El paso 1 muestra el saludo con el nombre y las 2 opciones de idioma
    Given que el usuario de onboarding "2" ha iniciado sesión por primera vez
    Then debe ver el saludo del usuario de onboarding "2"
    And debe ver las 2 opciones de idioma
    And debe ver el contador de progreso "Paso 1 de 4"

  @onboarding @i18n
  Scenario: Cambiar a inglés desde el paso 1 recarga el onboarding en inglés
    Given que el usuario de onboarding "3" ha iniciado sesión por primera vez
    When selecciona el idioma "English"
    Then debe estar en el onboarding en inglés
    And debe ver el título en inglés "Set up your account"

  # ============================================================================
  # PASO 2 — PRIMERA CUENTA
  # ============================================================================

  @onboarding @account
  Scenario: El paso 2 crea la primera cuenta y la confirma
    Given que el usuario de onboarding "2" ha iniciado sesión por primera vez
    When avanza al paso de crear cuenta
    And crea la cuenta "Cuenta Onboarding E2E" de tipo "Corriente" con saldo "1500000"
    Then debe ver la confirmación de cuenta creada
    When avanza hasta el último paso
    And pulsa el CTA "Ir al dashboard"
    Then debe estar en el dashboard en español
    When navega a la página de cuentas bancarias
    Then la cuenta "Cuenta Onboarding E2E" debe existir en la página de cuentas

  # ============================================================================
  # PASO 3 — MÓDULOS
  # ============================================================================

  @onboarding @modules
  Scenario: El paso 3 lista los módulos esperados
    Given que el usuario de onboarding "1" ha iniciado sesión por primera vez
    When avanza hasta el paso de módulos
    Then debe ver los siguientes módulos:
      | Dashboard |
      | Transacciones |
      | Cuentas |
      | Ahorros |
      | Gastos Fijos |
      | Gastos Variables |
      | Préstamos |
      | Inversiones |
      | Configuración |

  # ============================================================================
  # PASO 4 — FINALIZAR
  # ============================================================================

  @onboarding @finish
  Scenario: Completar el onboarding redirige al dashboard y no vuelve a redirigir
    Given que el usuario de onboarding "3" ha iniciado sesión por primera vez
    When avanza hasta el último paso
    And pulsa el CTA "Ir al dashboard"
    Then debe estar en el dashboard en español
    When recarga el dashboard
    Then debe seguir en el dashboard

  # ============================================================================
  # OMITIR
  # ============================================================================

  @onboarding @skip-flow
  Scenario: Omitir el onboarding confirma y redirige al dashboard
    Given que el usuario de onboarding "1" ha iniciado sesión por primera vez
    When pulsa "Omitir" y confirma en el modal
    Then debe estar en el dashboard en español
