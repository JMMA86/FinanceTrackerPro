// Generated from: e2e\features\auth.feature
import { test } from "playwright-bdd";

test.describe('Autenticación de usuarios', () => {

  test('Login exitoso redirige al dashboard', { tag: ['@login', '@happy-path'] }, async ({ Given, When, Then, page }) => { 
    await Given('que el usuario navega a la página de login en español', null, { page }); 
    await When('ingresa credenciales válidas en el formulario de login desktop', null, { page }); 
    await Then('debe ser redirigido al dashboard', null, { page }); 
  });

  test('Login con credenciales inválidas muestra error', { tag: ['@login', '@error'] }, async ({ Given, When, Then, And, page }) => { 
    await Given('que el usuario navega a la página de login en español', null, { page }); 
    await When('ingresa el email "inexistente@test.com" en el login desktop', null, { page }); 
    await And('ingresa la contraseña "WrongPass123" en el login desktop', null, { page }); 
    await And('hace clic en "Iniciar Sesión"', null, { page }); 
    await Then('debe ver un mensaje de error de login', null, { page }); 
  });

  test('Login con campos vacíos muestra validación HTML5', { tag: ['@login', '@validation'] }, async ({ Given, When, Then, page }) => { 
    await Given('que el usuario navega a la página de login en español', null, { page }); 
    await When('hace clic en "Iniciar Sesión" sin llenar campos', null, { page }); 
    await Then('la validación HTML5 debe impedir el envío del formulario de login', null, { page }); 
  });

  test('Usuario no autenticado accede al dashboard', { tag: ['@login', '@auth'] }, async ({ Given, When, Then, page }) => { 
    await Given('que el usuario navega a la página de login en español', null, { page }); 
    await Given('que el usuario no ha iniciado sesión', null, { page }); 
    await When('navega directamente a "/es/dashboard"', null, { page }); 
    await Then('debe ser redirigido a la página de login', null, { page }); 
  });

  test('Logout desde el dashboard redirige al login', { tag: ['@login', '@logout'] }, async ({ Given, When, Then, page }) => { 
    await Given('que el usuario navega a la página de login en español', null, { page }); 
    await Given('que el usuario ha iniciado sesión', null, { page }); 
    await When('hace clic en "Cerrar Sesión" en el sidebar', null, { page }); 
    await Then('debe ser redirigido a la página de login', null, { page }); 
  });

  test('Login con redirect en URL redirige al path correcto', { tag: ['@login', '@redirect'] }, async ({ Given, When, Then, And, page }) => { 
    await Given('que el usuario navega a la página de login en español', null, { page }); 
    await When('navega a "/es/login?redirect=/es/accounts"', null, { page }); 
    await And('ingresa credenciales válidas en el formulario de login desktop', null, { page }); 
    await Then('debe ser redirigido a "/es/accounts"', null, { page }); 
  });

  test('Registro exitoso muestra mensaje de éxito en login', { tag: ['@register', '@happy-path'] }, async ({ Given, When, Then, And, page }) => { 
    await Given('que el usuario navega a la página de login en español', null, { page }); 
    await When('cambia a modo registro en desktop', null, { page }); 
    await And('ingresa "Nuevo Usuario" en el campo nombre del registro desktop', null, { page }); 
    await And('ingresa un email único en el registro desktop', null, { page }); 
    await And('ingresa "E2ePassword123" en el campo contraseña del registro desktop', null, { page }); 
    await And('hace clic en "Registrarse" en el registro desktop', null, { page }); 
    await Then('debe ver un mensaje de éxito de registro en el formulario de login', null, { page }); 
  });

  test('Registro con email duplicado muestra error', { tag: ['@register', '@error'] }, async ({ Given, When, Then, And, page }) => { 
    await Given('que el usuario navega a la página de login en español', null, { page }); 
    await Given('que existe un usuario con email "e2e@financetrackerpro.com"', null, { page }); 
    await When('cambia a modo registro en desktop', null, { page }); 
    await And('ingresa "Test User" en el campo nombre del registro desktop', null, { page }); 
    await And('ingresa "e2e@financetrackerpro.com" en el email del registro desktop', null, { page }); 
    await And('ingresa "E2ePassword123" en el campo contraseña del registro desktop', null, { page }); 
    await And('hace clic en "Registrarse" en el registro desktop', null, { page }); 
    await Then('debe ver un mensaje de error en el registro', null, { page }); 
  });

  test('Botón de registro deshabilitado hasta cumplir requisitos de contraseña', { tag: ['@register', '@validation'] }, async ({ Given, When, Then, And, page }) => { 
    await Given('que el usuario navega a la página de login en español', null, { page }); 
    await When('cambia a modo registro en desktop', null, { page }); 
    await Then('el botón de registro debe estar deshabilitado', null, { page }); 
    await When('ingresa "Test User" en el campo nombre del registro desktop', null, { page }); 
    await And('ingresa "test@test.com" en el email del registro desktop', null, { page }); 
    await And('ingresa "abc" en el campo contraseña del registro desktop', null, { page }); 
    await Then('el botón de registro debe estar deshabilitado', null, { page }); 
    await When('ingresa "E2ePassword123" en el campo contraseña del registro desktop', null, { page }); 
    await Then('el botón de registro debe estar habilitado', null, { page }); 
  });

  test('Checklist de requisitos de contraseña se actualiza en tiempo real', { tag: ['@register', '@validation'] }, async ({ Given, When, Then, And, page }) => { 
    await Given('que el usuario navega a la página de login en español', null, { page }); 
    await When('cambia a modo registro en desktop', null, { page }); 
    await And('escribe caracteres en el campo contraseña del registro desktop', null, { page }); 
    await Then('los 4 requisitos de contraseña deben mostrarse sin cumplir', null, { page }); 
    await When('ingresa "E2ePassword123" en el campo contraseña del registro desktop', null, { page }); 
    await Then('los 4 requisitos de contraseña deben estar cumplidos', null, { page }); 
  });

  test('Registro con campos vacíos muestra validación HTML5', { tag: ['@register', '@validation'] }, async ({ Given, When, Then, And, page }) => { 
    await Given('que el usuario navega a la página de login en español', null, { page }); 
    await When('cambia a modo registro en desktop', null, { page }); 
    await And('intenta enviar el formulario de registro vacío', null, { page }); 
    await Then('la validación HTML5 debe impedir el envío del formulario de registro desktop', null, { page }); 
  });

  test('Cambiar idioma de español a inglés actualiza textos del login', { tag: ['@i18n'] }, async ({ Given, When, Then, And, page }) => { 
    await Given('que el usuario navega a la página de login en español', null, { page }); 
    await When('cambia el idioma a "English" en el selector de idioma', null, { page }); 
    await Then('los textos del login deben estar en inglés', null, { page }); 
    await And('la URL debe contener "/en/login"', null, { page }); 
  });

  test('Login en inglés redirige a dashboard en inglés', { tag: ['@i18n'] }, async ({ Given, When, Then, page }) => { 
    await Given('que el usuario navega a la página de login en español', null, { page }); 
    await When('cambia el idioma a "English" en el selector de idioma', null, { page }); 
    await Then('los textos del login deben estar en inglés', null, { page }); 
    await When('ingresa credenciales válidas en el formulario de login desktop', null, { page }); 
    await Then('debe ser redirigido al dashboard con idioma inglés', null, { page }); 
  });

  test('Login en viewport móvil muestra formulario mobile', { tag: ['@mobile', '@login'] }, async ({ Given, Then, And, page }) => { 
    await Given('que la pantalla es móvil 390x844', null, { page }); 
    await And('navega a la página de login en español', null, { page }); 
    await Then('debe ver el formulario de login mobile', null, { page }); 
  });

  test('Toggle entre login y registro en mobile', { tag: ['@mobile', '@register'] }, async ({ Given, When, Then, And, page }) => { 
    await Given('que la pantalla es móvil 390x844', null, { page }); 
    await And('navega a la página de login en español', null, { page }); 
    await Then('debe ver el formulario de login mobile', null, { page }); 
    await When('hace clic en "Crear Cuenta" en el toggle mobile', null, { page }); 
    await Then('debe ver el formulario de registro mobile', null, { page }); 
  });

});

// == technical section ==

test.use({
  $test: [({}, use) => use(test), { scope: 'test', box: true }],
  $uri: [({}, use) => use('e2e\\features\\auth.feature'), { scope: 'test', box: true }],
  $bddFileData: [({}, use) => use(bddFileData), { scope: "test", box: true }],
});

const bddFileData = [ // bdd-data-start
  {"pwTestLine":6,"pickleLine":11,"tags":["@login","@happy-path"],"steps":[{"pwStepLine":7,"gherkinStepLine":12,"keywordType":"Context","textWithKeyword":"Given que el usuario navega a la página de login en español","stepMatchArguments":[]},{"pwStepLine":8,"gherkinStepLine":13,"keywordType":"Action","textWithKeyword":"When ingresa credenciales válidas en el formulario de login desktop","stepMatchArguments":[]},{"pwStepLine":9,"gherkinStepLine":14,"keywordType":"Outcome","textWithKeyword":"Then debe ser redirigido al dashboard","stepMatchArguments":[]}]},
  {"pwTestLine":12,"pickleLine":17,"tags":["@login","@error"],"steps":[{"pwStepLine":13,"gherkinStepLine":18,"keywordType":"Context","textWithKeyword":"Given que el usuario navega a la página de login en español","stepMatchArguments":[]},{"pwStepLine":14,"gherkinStepLine":19,"keywordType":"Action","textWithKeyword":"When ingresa el email \"inexistente@test.com\" en el login desktop","stepMatchArguments":[{"group":{"start":17,"value":"\"inexistente@test.com\"","children":[{"start":18,"value":"inexistente@test.com","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":15,"gherkinStepLine":20,"keywordType":"Action","textWithKeyword":"And ingresa la contraseña \"WrongPass123\" en el login desktop","stepMatchArguments":[{"group":{"start":22,"value":"\"WrongPass123\"","children":[{"start":23,"value":"WrongPass123","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":16,"gherkinStepLine":21,"keywordType":"Action","textWithKeyword":"And hace clic en \"Iniciar Sesión\"","stepMatchArguments":[{"group":{"start":13,"value":"\"Iniciar Sesión\"","children":[{"start":14,"value":"Iniciar Sesión","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":17,"gherkinStepLine":22,"keywordType":"Outcome","textWithKeyword":"Then debe ver un mensaje de error de login","stepMatchArguments":[]}]},
  {"pwTestLine":20,"pickleLine":25,"tags":["@login","@validation"],"steps":[{"pwStepLine":21,"gherkinStepLine":26,"keywordType":"Context","textWithKeyword":"Given que el usuario navega a la página de login en español","stepMatchArguments":[]},{"pwStepLine":22,"gherkinStepLine":27,"keywordType":"Action","textWithKeyword":"When hace clic en \"Iniciar Sesión\" sin llenar campos","stepMatchArguments":[{"group":{"start":13,"value":"\"Iniciar Sesión\"","children":[{"start":14,"value":"Iniciar Sesión","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":23,"gherkinStepLine":28,"keywordType":"Outcome","textWithKeyword":"Then la validación HTML5 debe impedir el envío del formulario de login","stepMatchArguments":[]}]},
  {"pwTestLine":26,"pickleLine":31,"tags":["@login","@auth"],"steps":[{"pwStepLine":27,"gherkinStepLine":32,"keywordType":"Context","textWithKeyword":"Given que el usuario navega a la página de login en español","stepMatchArguments":[]},{"pwStepLine":28,"gherkinStepLine":33,"keywordType":"Context","textWithKeyword":"Given que el usuario no ha iniciado sesión","stepMatchArguments":[]},{"pwStepLine":29,"gherkinStepLine":34,"keywordType":"Action","textWithKeyword":"When navega directamente a \"/es/dashboard\"","stepMatchArguments":[{"group":{"start":22,"value":"\"/es/dashboard\"","children":[{"start":23,"value":"/es/dashboard","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":30,"gherkinStepLine":35,"keywordType":"Outcome","textWithKeyword":"Then debe ser redirigido a la página de login","stepMatchArguments":[]}]},
  {"pwTestLine":33,"pickleLine":38,"tags":["@login","@logout"],"steps":[{"pwStepLine":34,"gherkinStepLine":39,"keywordType":"Context","textWithKeyword":"Given que el usuario navega a la página de login en español","stepMatchArguments":[]},{"pwStepLine":35,"gherkinStepLine":40,"keywordType":"Context","textWithKeyword":"Given que el usuario ha iniciado sesión","stepMatchArguments":[]},{"pwStepLine":36,"gherkinStepLine":41,"keywordType":"Action","textWithKeyword":"When hace clic en \"Cerrar Sesión\" en el sidebar","stepMatchArguments":[{"group":{"start":13,"value":"\"Cerrar Sesión\"","children":[{"start":14,"value":"Cerrar Sesión","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":37,"gherkinStepLine":42,"keywordType":"Outcome","textWithKeyword":"Then debe ser redirigido a la página de login","stepMatchArguments":[]}]},
  {"pwTestLine":40,"pickleLine":45,"tags":["@login","@redirect"],"steps":[{"pwStepLine":41,"gherkinStepLine":46,"keywordType":"Context","textWithKeyword":"Given que el usuario navega a la página de login en español","stepMatchArguments":[]},{"pwStepLine":42,"gherkinStepLine":47,"keywordType":"Action","textWithKeyword":"When navega a \"/es/login?redirect=/es/accounts\"","stepMatchArguments":[{"group":{"start":9,"value":"\"/es/login?redirect=/es/accounts\"","children":[{"start":10,"value":"/es/login?redirect=/es/accounts","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":43,"gherkinStepLine":48,"keywordType":"Action","textWithKeyword":"And ingresa credenciales válidas en el formulario de login desktop","stepMatchArguments":[]},{"pwStepLine":44,"gherkinStepLine":49,"keywordType":"Outcome","textWithKeyword":"Then debe ser redirigido a \"/es/accounts\"","stepMatchArguments":[{"group":{"start":22,"value":"\"/es/accounts\"","children":[{"start":23,"value":"/es/accounts","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]}]},
  {"pwTestLine":47,"pickleLine":56,"tags":["@register","@happy-path"],"steps":[{"pwStepLine":48,"gherkinStepLine":57,"keywordType":"Context","textWithKeyword":"Given que el usuario navega a la página de login en español","stepMatchArguments":[]},{"pwStepLine":49,"gherkinStepLine":58,"keywordType":"Action","textWithKeyword":"When cambia a modo registro en desktop","stepMatchArguments":[]},{"pwStepLine":50,"gherkinStepLine":59,"keywordType":"Action","textWithKeyword":"And ingresa \"Nuevo Usuario\" en el campo nombre del registro desktop","stepMatchArguments":[{"group":{"start":8,"value":"\"Nuevo Usuario\"","children":[{"start":9,"value":"Nuevo Usuario","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":51,"gherkinStepLine":60,"keywordType":"Action","textWithKeyword":"And ingresa un email único en el registro desktop","stepMatchArguments":[]},{"pwStepLine":52,"gherkinStepLine":61,"keywordType":"Action","textWithKeyword":"And ingresa \"E2ePassword123\" en el campo contraseña del registro desktop","stepMatchArguments":[{"group":{"start":8,"value":"\"E2ePassword123\"","children":[{"start":9,"value":"E2ePassword123","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":53,"gherkinStepLine":62,"keywordType":"Action","textWithKeyword":"And hace clic en \"Registrarse\" en el registro desktop","stepMatchArguments":[{"group":{"start":13,"value":"\"Registrarse\"","children":[{"start":14,"value":"Registrarse","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":54,"gherkinStepLine":63,"keywordType":"Outcome","textWithKeyword":"Then debe ver un mensaje de éxito de registro en el formulario de login","stepMatchArguments":[]}]},
  {"pwTestLine":57,"pickleLine":66,"tags":["@register","@error"],"steps":[{"pwStepLine":58,"gherkinStepLine":67,"keywordType":"Context","textWithKeyword":"Given que el usuario navega a la página de login en español","stepMatchArguments":[]},{"pwStepLine":59,"gherkinStepLine":68,"keywordType":"Context","textWithKeyword":"Given que existe un usuario con email \"e2e@financetrackerpro.com\"","stepMatchArguments":[{"group":{"start":32,"value":"\"e2e@financetrackerpro.com\"","children":[{"start":33,"value":"e2e@financetrackerpro.com","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":60,"gherkinStepLine":69,"keywordType":"Action","textWithKeyword":"When cambia a modo registro en desktop","stepMatchArguments":[]},{"pwStepLine":61,"gherkinStepLine":70,"keywordType":"Action","textWithKeyword":"And ingresa \"Test User\" en el campo nombre del registro desktop","stepMatchArguments":[{"group":{"start":8,"value":"\"Test User\"","children":[{"start":9,"value":"Test User","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":62,"gherkinStepLine":71,"keywordType":"Action","textWithKeyword":"And ingresa \"e2e@financetrackerpro.com\" en el email del registro desktop","stepMatchArguments":[{"group":{"start":8,"value":"\"e2e@financetrackerpro.com\"","children":[{"start":9,"value":"e2e@financetrackerpro.com","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":63,"gherkinStepLine":72,"keywordType":"Action","textWithKeyword":"And ingresa \"E2ePassword123\" en el campo contraseña del registro desktop","stepMatchArguments":[{"group":{"start":8,"value":"\"E2ePassword123\"","children":[{"start":9,"value":"E2ePassword123","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":64,"gherkinStepLine":73,"keywordType":"Action","textWithKeyword":"And hace clic en \"Registrarse\" en el registro desktop","stepMatchArguments":[{"group":{"start":13,"value":"\"Registrarse\"","children":[{"start":14,"value":"Registrarse","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":65,"gherkinStepLine":74,"keywordType":"Outcome","textWithKeyword":"Then debe ver un mensaje de error en el registro","stepMatchArguments":[]}]},
  {"pwTestLine":68,"pickleLine":77,"tags":["@register","@validation"],"steps":[{"pwStepLine":69,"gherkinStepLine":78,"keywordType":"Context","textWithKeyword":"Given que el usuario navega a la página de login en español","stepMatchArguments":[]},{"pwStepLine":70,"gherkinStepLine":79,"keywordType":"Action","textWithKeyword":"When cambia a modo registro en desktop","stepMatchArguments":[]},{"pwStepLine":71,"gherkinStepLine":80,"keywordType":"Outcome","textWithKeyword":"Then el botón de registro debe estar deshabilitado","stepMatchArguments":[]},{"pwStepLine":72,"gherkinStepLine":81,"keywordType":"Action","textWithKeyword":"When ingresa \"Test User\" en el campo nombre del registro desktop","stepMatchArguments":[{"group":{"start":8,"value":"\"Test User\"","children":[{"start":9,"value":"Test User","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":73,"gherkinStepLine":82,"keywordType":"Action","textWithKeyword":"And ingresa \"test@test.com\" en el email del registro desktop","stepMatchArguments":[{"group":{"start":8,"value":"\"test@test.com\"","children":[{"start":9,"value":"test@test.com","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":74,"gherkinStepLine":83,"keywordType":"Action","textWithKeyword":"And ingresa \"abc\" en el campo contraseña del registro desktop","stepMatchArguments":[{"group":{"start":8,"value":"\"abc\"","children":[{"start":9,"value":"abc","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":75,"gherkinStepLine":84,"keywordType":"Outcome","textWithKeyword":"Then el botón de registro debe estar deshabilitado","stepMatchArguments":[]},{"pwStepLine":76,"gherkinStepLine":85,"keywordType":"Action","textWithKeyword":"When ingresa \"E2ePassword123\" en el campo contraseña del registro desktop","stepMatchArguments":[{"group":{"start":8,"value":"\"E2ePassword123\"","children":[{"start":9,"value":"E2ePassword123","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":77,"gherkinStepLine":86,"keywordType":"Outcome","textWithKeyword":"Then el botón de registro debe estar habilitado","stepMatchArguments":[]}]},
  {"pwTestLine":80,"pickleLine":89,"tags":["@register","@validation"],"steps":[{"pwStepLine":81,"gherkinStepLine":90,"keywordType":"Context","textWithKeyword":"Given que el usuario navega a la página de login en español","stepMatchArguments":[]},{"pwStepLine":82,"gherkinStepLine":91,"keywordType":"Action","textWithKeyword":"When cambia a modo registro en desktop","stepMatchArguments":[]},{"pwStepLine":83,"gherkinStepLine":92,"keywordType":"Action","textWithKeyword":"And escribe caracteres en el campo contraseña del registro desktop","stepMatchArguments":[]},{"pwStepLine":84,"gherkinStepLine":93,"keywordType":"Outcome","textWithKeyword":"Then los 4 requisitos de contraseña deben mostrarse sin cumplir","stepMatchArguments":[{"group":{"start":4,"value":"4","children":[]},"parameterTypeName":"int"}]},{"pwStepLine":85,"gherkinStepLine":94,"keywordType":"Action","textWithKeyword":"When ingresa \"E2ePassword123\" en el campo contraseña del registro desktop","stepMatchArguments":[{"group":{"start":8,"value":"\"E2ePassword123\"","children":[{"start":9,"value":"E2ePassword123","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":86,"gherkinStepLine":95,"keywordType":"Outcome","textWithKeyword":"Then los 4 requisitos de contraseña deben estar cumplidos","stepMatchArguments":[{"group":{"start":4,"value":"4","children":[]},"parameterTypeName":"int"}]}]},
  {"pwTestLine":89,"pickleLine":98,"tags":["@register","@validation"],"steps":[{"pwStepLine":90,"gherkinStepLine":99,"keywordType":"Context","textWithKeyword":"Given que el usuario navega a la página de login en español","stepMatchArguments":[]},{"pwStepLine":91,"gherkinStepLine":100,"keywordType":"Action","textWithKeyword":"When cambia a modo registro en desktop","stepMatchArguments":[]},{"pwStepLine":92,"gherkinStepLine":101,"keywordType":"Action","textWithKeyword":"And intenta enviar el formulario de registro vacío","stepMatchArguments":[]},{"pwStepLine":93,"gherkinStepLine":102,"keywordType":"Outcome","textWithKeyword":"Then la validación HTML5 debe impedir el envío del formulario de registro desktop","stepMatchArguments":[]}]},
  {"pwTestLine":96,"pickleLine":109,"tags":["@i18n"],"steps":[{"pwStepLine":97,"gherkinStepLine":110,"keywordType":"Context","textWithKeyword":"Given que el usuario navega a la página de login en español","stepMatchArguments":[]},{"pwStepLine":98,"gherkinStepLine":111,"keywordType":"Action","textWithKeyword":"When cambia el idioma a \"English\" en el selector de idioma","stepMatchArguments":[{"group":{"start":19,"value":"\"English\"","children":[{"start":20,"value":"English","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":99,"gherkinStepLine":112,"keywordType":"Outcome","textWithKeyword":"Then los textos del login deben estar en inglés","stepMatchArguments":[]},{"pwStepLine":100,"gherkinStepLine":113,"keywordType":"Outcome","textWithKeyword":"And la URL debe contener \"/en/login\"","stepMatchArguments":[{"group":{"start":21,"value":"\"/en/login\"","children":[{"start":22,"value":"/en/login","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]}]},
  {"pwTestLine":103,"pickleLine":116,"tags":["@i18n"],"steps":[{"pwStepLine":104,"gherkinStepLine":117,"keywordType":"Context","textWithKeyword":"Given que el usuario navega a la página de login en español","stepMatchArguments":[]},{"pwStepLine":105,"gherkinStepLine":118,"keywordType":"Action","textWithKeyword":"When cambia el idioma a \"English\" en el selector de idioma","stepMatchArguments":[{"group":{"start":19,"value":"\"English\"","children":[{"start":20,"value":"English","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":106,"gherkinStepLine":119,"keywordType":"Outcome","textWithKeyword":"Then los textos del login deben estar en inglés","stepMatchArguments":[]},{"pwStepLine":107,"gherkinStepLine":120,"keywordType":"Action","textWithKeyword":"When ingresa credenciales válidas en el formulario de login desktop","stepMatchArguments":[]},{"pwStepLine":108,"gherkinStepLine":121,"keywordType":"Outcome","textWithKeyword":"Then debe ser redirigido al dashboard con idioma inglés","stepMatchArguments":[]}]},
  {"pwTestLine":111,"pickleLine":128,"tags":["@mobile","@login"],"steps":[{"pwStepLine":112,"gherkinStepLine":129,"keywordType":"Context","textWithKeyword":"Given que la pantalla es móvil 390x844","stepMatchArguments":[{"group":{"start":25,"value":"390","children":[]},"parameterTypeName":"int"},{"group":{"start":29,"value":"844","children":[]},"parameterTypeName":"int"}]},{"pwStepLine":113,"gherkinStepLine":130,"keywordType":"Context","textWithKeyword":"And navega a la página de login en español","stepMatchArguments":[]},{"pwStepLine":114,"gherkinStepLine":131,"keywordType":"Outcome","textWithKeyword":"Then debe ver el formulario de login mobile","stepMatchArguments":[]}]},
  {"pwTestLine":117,"pickleLine":134,"tags":["@mobile","@register"],"steps":[{"pwStepLine":118,"gherkinStepLine":135,"keywordType":"Context","textWithKeyword":"Given que la pantalla es móvil 390x844","stepMatchArguments":[{"group":{"start":25,"value":"390","children":[]},"parameterTypeName":"int"},{"group":{"start":29,"value":"844","children":[]},"parameterTypeName":"int"}]},{"pwStepLine":119,"gherkinStepLine":136,"keywordType":"Context","textWithKeyword":"And navega a la página de login en español","stepMatchArguments":[]},{"pwStepLine":120,"gherkinStepLine":137,"keywordType":"Outcome","textWithKeyword":"Then debe ver el formulario de login mobile","stepMatchArguments":[]},{"pwStepLine":121,"gherkinStepLine":138,"keywordType":"Action","textWithKeyword":"When hace clic en \"Crear Cuenta\" en el toggle mobile","stepMatchArguments":[{"group":{"start":13,"value":"\"Crear Cuenta\"","children":[{"start":14,"value":"Crear Cuenta","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":122,"gherkinStepLine":139,"keywordType":"Outcome","textWithKeyword":"Then debe ver el formulario de registro mobile","stepMatchArguments":[]}]},
]; // bdd-data-end