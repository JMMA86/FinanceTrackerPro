Feature: Autenticación de usuarios
  Como usuario de FinanceTrackerPro
  Quiero iniciar sesión y registrarme de forma segura
  Para acceder a mi información financiera protegida

  Background:
    Given que el usuario navega a la página de login en español

  # ============================================================================
  # LOGIN FLOWS
  # ============================================================================

  @login @happy-path
  Scenario: Login exitoso redirige al dashboard
    When ingresa credenciales válidas en el formulario de login desktop
    Then debe ser redirigido al dashboard

  @login @error
  Scenario: Login con credenciales inválidas muestra error
    When ingresa el email "inexistente@test.com" en el login desktop
    And ingresa la contraseña "WrongPass123" en el login desktop
    And hace clic en "Iniciar Sesión"
    Then debe ver un mensaje de error de login

  @login @validation
  Scenario: Login con campos vacíos muestra validación HTML5
    When hace clic en "Iniciar Sesión" sin llenar campos
    Then la validación HTML5 debe impedir el envío del formulario de login

  @login @auth
  Scenario: Usuario no autenticado accede al dashboard
    Given que el usuario no ha iniciado sesión
    When navega directamente a "/es/dashboard"
    Then debe ser redirigido a la página de login

  @login @logout
  Scenario: Logout desde el dashboard redirige al login
    Given que el usuario ha iniciado sesión
    When hace clic en "Cerrar Sesión" en el sidebar
    Then debe ser redirigido a la página de login

  @login @redirect
  Scenario: Login con redirect en URL redirige al path correcto
    When navega a "/es/login?redirect=/es/accounts"
    And ingresa credenciales válidas en el formulario de login desktop
    Then debe ser redirigido a "/es/accounts"

  # ============================================================================
  # REGISTER FLOWS (Desktop)
  # ============================================================================

  @register @happy-path
  Scenario: Registro exitoso muestra mensaje de éxito en login
    When cambia a modo registro en desktop
    And ingresa "Nuevo Usuario" en el campo nombre del registro desktop
    And ingresa un email único en el registro desktop
    And ingresa "E2ePassword123" en el campo contraseña del registro desktop
    And hace clic en "Registrarse" en el registro desktop
    Then debe ver un mensaje de éxito de registro en el formulario de login

  @register @error
  Scenario: Registro con email duplicado muestra error
    Given que existe un usuario con email "e2e@financetrackerpro.com"
    When cambia a modo registro en desktop
    And ingresa "Test User" en el campo nombre del registro desktop
    And ingresa "e2e@financetrackerpro.com" en el email del registro desktop
    And ingresa "E2ePassword123" en el campo contraseña del registro desktop
    And hace clic en "Registrarse" en el registro desktop
    Then debe ver un mensaje de error en el registro

  @register @validation
  Scenario: Botón de registro deshabilitado hasta cumplir requisitos de contraseña
    When cambia a modo registro en desktop
    Then el botón de registro debe estar deshabilitado
    When ingresa "Test User" en el campo nombre del registro desktop
    And ingresa "test@test.com" en el email del registro desktop
    And ingresa "abc" en el campo contraseña del registro desktop
    Then el botón de registro debe estar deshabilitado
    When ingresa "E2ePassword123" en el campo contraseña del registro desktop
    Then el botón de registro debe estar habilitado

  @register @validation
  Scenario: Checklist de requisitos de contraseña se actualiza en tiempo real
    When cambia a modo registro en desktop
    And escribe caracteres en el campo contraseña del registro desktop
    Then los 4 requisitos de contraseña deben mostrarse sin cumplir
    When ingresa "E2ePassword123" en el campo contraseña del registro desktop
    Then los 4 requisitos de contraseña deben estar cumplidos

  @register @validation
  Scenario: Registro con campos vacíos muestra validación HTML5
    When cambia a modo registro en desktop
    And intenta enviar el formulario de registro vacío
    Then la validación HTML5 debe impedir el envío del formulario de registro desktop

  # ============================================================================
  # MULTI-LANGUAGE
  # ============================================================================

  @i18n
  Scenario: Cambiar idioma de español a inglés actualiza textos del login
    When cambia el idioma a "English" en el selector de idioma
    Then los textos del login deben estar en inglés
    And la URL debe contener "/en/login"

  @i18n
  Scenario: Login en inglés redirige a dashboard en inglés
    When cambia el idioma a "English" en el selector de idioma
    Then los textos del login deben estar en inglés
    When ingresa credenciales válidas en el formulario de login desktop
    Then debe ser redirigido al dashboard con idioma inglés

  # ============================================================================
  # MOBILE
  # ============================================================================

  @mobile @login
  Scenario: Login en viewport móvil muestra formulario mobile
    Given que la pantalla es móvil 390x844
    And navega a la página de login en español
    Then debe ver el formulario de login mobile

  @mobile @register
  Scenario: Toggle entre login y registro en mobile
    Given que la pantalla es móvil 390x844
    And navega a la página de login en español
    Then debe ver el formulario de login mobile
    When hace clic en "Crear Cuenta" en el toggle mobile
    Then debe ver el formulario de registro mobile
