// Generated from: e2e\features\auth.feature
import { test } from "playwright-bdd";

test.describe('Autenticación de usuarios', () => {

  test.beforeEach('Background', async ({ Given, page }, testInfo) => { if (testInfo.error) return;
    await Given('que el usuario navega a la página de login en español', null, { page }); 
  });
  
  test('Login exitoso redirige al dashboard', { tag: ['@login', '@happy-path'] }, async ({ When, Then, page }) => { 
    await When('ingresa credenciales válidas en el formulario de login desktop', null, { page }); 
    await Then('debe ser redirigido al dashboard', null, { page }); 
  });

  test('Login con credenciales inválidas muestra error', { tag: ['@login', '@error'] }, async ({ When, Then, And, page }) => { 
    await When('ingresa el email "inexistente@test.com" en el login desktop', null, { page }); 
    await And('ingresa la contraseña "WrongPass123" en el login desktop', null, { page }); 
    await And('hace clic en "Iniciar Sesión"', null, { page }); 
    await Then('debe ver un mensaje de error de login', null, { page }); 
  });

  test('Login con campos vacíos muestra validación HTML5', { tag: ['@login', '@validation'] }, async ({ When, Then, page }) => { 
    await When('hace clic en "Iniciar Sesión" sin llenar campos', null, { page }); 
    await Then('la validación HTML5 debe impedir el envío del formulario de login', null, { page }); 
  });

  test('Usuario no autenticado accede al dashboard', { tag: ['@login', '@auth'] }, async ({ Given, When, Then, page }) => { 
    await Given('que el usuario no ha iniciado sesión', null, { page }); 
    await When('navega directamente a "/es/dashboard"', null, { page }); 
    await Then('debe ser redirigido a la página de login', null, { page }); 
  });

  test('Logout desde el dashboard redirige al login', { tag: ['@login', '@logout'] }, async ({ Given, When, Then, page }) => { 
    await Given('que el usuario ha iniciado sesión', null, { page }); 
    await When('hace clic en "Cerrar Sesión" en el sidebar', null, { page }); 
    await Then('debe ser redirigido a la página de login', null, { page }); 
  });

  test('Login con redirect en URL redirige al path correcto', { tag: ['@login', '@redirect'] }, async ({ When, Then, And, page }) => { 
    await When('navega a "/es/login?redirect=/es/accounts"', null, { page }); 
    await And('ingresa credenciales válidas en el formulario de login desktop', null, { page }); 
    await Then('debe ser redirigido a "/es/accounts"', null, { page }); 
  });

  test('Registro exitoso muestra mensaje de éxito en login', { tag: ['@register', '@happy-path'] }, async ({ When, Then, And, page }) => { 
    await When('cambia a modo registro en desktop', null, { page }); 
    await And('ingresa "Nuevo Usuario" en el campo nombre del registro desktop', null, { page }); 
    await And('ingresa un email único en el registro desktop', null, { page }); 
    await And('ingresa "E2ePassword123" en el campo contraseña del registro desktop', null, { page }); 
    await And('hace clic en "Registrarse" en el registro desktop', null, { page }); 
    await Then('debe ver un mensaje de éxito de registro en el formulario de login', null, { page }); 
  });

  test('Registro con email duplicado muestra error', { tag: ['@register', '@error'] }, async ({ Given, When, Then, And, page }) => { 
    await Given('que existe un usuario con email "e2e@financetrackerpro.com"', null, { page }); 
    await When('cambia a modo registro en desktop', null, { page }); 
    await And('ingresa "Test User" en el campo nombre del registro desktop', null, { page }); 
    await And('ingresa "e2e@financetrackerpro.com" en el email del registro desktop', null, { page }); 
    await And('ingresa "E2ePassword123" en el campo contraseña del registro desktop', null, { page }); 
    await And('hace clic en "Registrarse" en el registro desktop', null, { page }); 
    await Then('debe ver un mensaje de error en el registro', null, { page }); 
  });

  test('Botón de registro deshabilitado hasta cumplir requisitos de contraseña', { tag: ['@register', '@validation'] }, async ({ When, Then, And, page }) => { 
    await When('cambia a modo registro en desktop', null, { page }); 
    await Then('el botón de registro debe estar deshabilitado', null, { page }); 
    await When('ingresa "Test User" en el campo nombre del registro desktop', null, { page }); 
    await And('ingresa "test@test.com" en el email del registro desktop', null, { page }); 
    await And('ingresa "abc" en el campo contraseña del registro desktop', null, { page }); 
    await Then('el botón de registro debe estar deshabilitado', null, { page }); 
    await When('ingresa "E2ePassword123" en el campo contraseña del registro desktop', null, { page }); 
    await Then('el botón de registro debe estar habilitado', null, { page }); 
  });

  test('Checklist de requisitos de contraseña se actualiza en tiempo real', { tag: ['@register', '@validation'] }, async ({ When, Then, And, page }) => { 
    await When('cambia a modo registro en desktop', null, { page }); 
    await And('escribe caracteres en el campo contraseña del registro desktop', null, { page }); 
    await Then('los 4 requisitos de contraseña deben mostrarse sin cumplir', null, { page }); 
    await When('ingresa "E2ePassword123" en el campo contraseña del registro desktop', null, { page }); 
    await Then('los 4 requisitos de contraseña deben estar cumplidos', null, { page }); 
  });

  test('Registro con campos vacíos muestra validación HTML5', { tag: ['@register', '@validation'] }, async ({ When, Then, And, page }) => { 
    await When('cambia a modo registro en desktop', null, { page }); 
    await And('intenta enviar el formulario de registro vacío', null, { page }); 
    await Then('la validación HTML5 debe impedir el envío del formulario de registro desktop', null, { page }); 
  });

  test('Cambiar idioma de español a inglés actualiza textos del login', { tag: ['@i18n'] }, async ({ When, Then, And, page }) => { 
    await When('cambia el idioma a "English" en el selector de idioma', null, { page }); 
    await Then('los textos del login deben estar en inglés', null, { page }); 
    await And('la URL debe contener "/en/login"', null, { page }); 
  });

  test('Login en inglés redirige a dashboard en inglés', { tag: ['@i18n'] }, async ({ When, Then, page }) => { 
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
  {"pwTestLine":10,"pickleLine":14,"tags":["@login","@happy-path"],"steps":[{"pwStepLine":7,"gherkinStepLine":7,"keywordType":"Context","textWithKeyword":"Given que el usuario navega a la página de login en español","isBg":true,"stepMatchArguments":[]},{"pwStepLine":11,"gherkinStepLine":15,"keywordType":"Action","textWithKeyword":"When ingresa credenciales válidas en el formulario de login desktop","stepMatchArguments":[]},{"pwStepLine":12,"gherkinStepLine":16,"keywordType":"Outcome","textWithKeyword":"Then debe ser redirigido al dashboard","stepMatchArguments":[]}]},
  {"pwTestLine":15,"pickleLine":19,"tags":["@login","@error"],"steps":[{"pwStepLine":7,"gherkinStepLine":7,"keywordType":"Context","textWithKeyword":"Given que el usuario navega a la página de login en español","isBg":true,"stepMatchArguments":[]},{"pwStepLine":16,"gherkinStepLine":20,"keywordType":"Action","textWithKeyword":"When ingresa el email \"inexistente@test.com\" en el login desktop","stepMatchArguments":[{"group":{"start":17,"value":"\"inexistente@test.com\"","children":[{"start":18,"value":"inexistente@test.com","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":17,"gherkinStepLine":21,"keywordType":"Action","textWithKeyword":"And ingresa la contraseña \"WrongPass123\" en el login desktop","stepMatchArguments":[{"group":{"start":22,"value":"\"WrongPass123\"","children":[{"start":23,"value":"WrongPass123","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":18,"gherkinStepLine":22,"keywordType":"Action","textWithKeyword":"And hace clic en \"Iniciar Sesión\"","stepMatchArguments":[{"group":{"start":13,"value":"\"Iniciar Sesión\"","children":[{"start":14,"value":"Iniciar Sesión","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":19,"gherkinStepLine":23,"keywordType":"Outcome","textWithKeyword":"Then debe ver un mensaje de error de login","stepMatchArguments":[]}]},
  {"pwTestLine":22,"pickleLine":26,"tags":["@login","@validation"],"steps":[{"pwStepLine":7,"gherkinStepLine":7,"keywordType":"Context","textWithKeyword":"Given que el usuario navega a la página de login en español","isBg":true,"stepMatchArguments":[]},{"pwStepLine":23,"gherkinStepLine":27,"keywordType":"Action","textWithKeyword":"When hace clic en \"Iniciar Sesión\" sin llenar campos","stepMatchArguments":[{"group":{"start":13,"value":"\"Iniciar Sesión\"","children":[{"start":14,"value":"Iniciar Sesión","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":24,"gherkinStepLine":28,"keywordType":"Outcome","textWithKeyword":"Then la validación HTML5 debe impedir el envío del formulario de login","stepMatchArguments":[]}]},
  {"pwTestLine":27,"pickleLine":31,"tags":["@login","@auth"],"steps":[{"pwStepLine":7,"gherkinStepLine":7,"keywordType":"Context","textWithKeyword":"Given que el usuario navega a la página de login en español","isBg":true,"stepMatchArguments":[]},{"pwStepLine":28,"gherkinStepLine":32,"keywordType":"Context","textWithKeyword":"Given que el usuario no ha iniciado sesión","stepMatchArguments":[]},{"pwStepLine":29,"gherkinStepLine":33,"keywordType":"Action","textWithKeyword":"When navega directamente a \"/es/dashboard\"","stepMatchArguments":[{"group":{"start":22,"value":"\"/es/dashboard\"","children":[{"start":23,"value":"/es/dashboard","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":30,"gherkinStepLine":34,"keywordType":"Outcome","textWithKeyword":"Then debe ser redirigido a la página de login","stepMatchArguments":[]}]},
  {"pwTestLine":33,"pickleLine":37,"tags":["@login","@logout"],"steps":[{"pwStepLine":7,"gherkinStepLine":7,"keywordType":"Context","textWithKeyword":"Given que el usuario navega a la página de login en español","isBg":true,"stepMatchArguments":[]},{"pwStepLine":34,"gherkinStepLine":38,"keywordType":"Context","textWithKeyword":"Given que el usuario ha iniciado sesión","stepMatchArguments":[]},{"pwStepLine":35,"gherkinStepLine":39,"keywordType":"Action","textWithKeyword":"When hace clic en \"Cerrar Sesión\" en el sidebar","stepMatchArguments":[{"group":{"start":13,"value":"\"Cerrar Sesión\"","children":[{"start":14,"value":"Cerrar Sesión","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":36,"gherkinStepLine":40,"keywordType":"Outcome","textWithKeyword":"Then debe ser redirigido a la página de login","stepMatchArguments":[]}]},
  {"pwTestLine":39,"pickleLine":43,"tags":["@login","@redirect"],"steps":[{"pwStepLine":7,"gherkinStepLine":7,"keywordType":"Context","textWithKeyword":"Given que el usuario navega a la página de login en español","isBg":true,"stepMatchArguments":[]},{"pwStepLine":40,"gherkinStepLine":44,"keywordType":"Action","textWithKeyword":"When navega a \"/es/login?redirect=/es/accounts\"","stepMatchArguments":[{"group":{"start":9,"value":"\"/es/login?redirect=/es/accounts\"","children":[{"start":10,"value":"/es/login?redirect=/es/accounts","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":41,"gherkinStepLine":45,"keywordType":"Action","textWithKeyword":"And ingresa credenciales válidas en el formulario de login desktop","stepMatchArguments":[]},{"pwStepLine":42,"gherkinStepLine":46,"keywordType":"Outcome","textWithKeyword":"Then debe ser redirigido a \"/es/accounts\"","stepMatchArguments":[{"group":{"start":22,"value":"\"/es/accounts\"","children":[{"start":23,"value":"/es/accounts","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]}]},
  {"pwTestLine":45,"pickleLine":53,"tags":["@register","@happy-path"],"steps":[{"pwStepLine":7,"gherkinStepLine":7,"keywordType":"Context","textWithKeyword":"Given que el usuario navega a la página de login en español","isBg":true,"stepMatchArguments":[]},{"pwStepLine":46,"gherkinStepLine":54,"keywordType":"Action","textWithKeyword":"When cambia a modo registro en desktop","stepMatchArguments":[]},{"pwStepLine":47,"gherkinStepLine":55,"keywordType":"Action","textWithKeyword":"And ingresa \"Nuevo Usuario\" en el campo nombre del registro desktop","stepMatchArguments":[{"group":{"start":8,"value":"\"Nuevo Usuario\"","children":[{"start":9,"value":"Nuevo Usuario","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":48,"gherkinStepLine":56,"keywordType":"Action","textWithKeyword":"And ingresa un email único en el registro desktop","stepMatchArguments":[]},{"pwStepLine":49,"gherkinStepLine":57,"keywordType":"Action","textWithKeyword":"And ingresa \"E2ePassword123\" en el campo contraseña del registro desktop","stepMatchArguments":[{"group":{"start":8,"value":"\"E2ePassword123\"","children":[{"start":9,"value":"E2ePassword123","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":50,"gherkinStepLine":58,"keywordType":"Action","textWithKeyword":"And hace clic en \"Registrarse\" en el registro desktop","stepMatchArguments":[{"group":{"start":13,"value":"\"Registrarse\"","children":[{"start":14,"value":"Registrarse","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":51,"gherkinStepLine":59,"keywordType":"Outcome","textWithKeyword":"Then debe ver un mensaje de éxito de registro en el formulario de login","stepMatchArguments":[]}]},
  {"pwTestLine":54,"pickleLine":62,"tags":["@register","@error"],"steps":[{"pwStepLine":7,"gherkinStepLine":7,"keywordType":"Context","textWithKeyword":"Given que el usuario navega a la página de login en español","isBg":true,"stepMatchArguments":[]},{"pwStepLine":55,"gherkinStepLine":63,"keywordType":"Context","textWithKeyword":"Given que existe un usuario con email \"e2e@financetrackerpro.com\"","stepMatchArguments":[{"group":{"start":32,"value":"\"e2e@financetrackerpro.com\"","children":[{"start":33,"value":"e2e@financetrackerpro.com","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":56,"gherkinStepLine":64,"keywordType":"Action","textWithKeyword":"When cambia a modo registro en desktop","stepMatchArguments":[]},{"pwStepLine":57,"gherkinStepLine":65,"keywordType":"Action","textWithKeyword":"And ingresa \"Test User\" en el campo nombre del registro desktop","stepMatchArguments":[{"group":{"start":8,"value":"\"Test User\"","children":[{"start":9,"value":"Test User","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":58,"gherkinStepLine":66,"keywordType":"Action","textWithKeyword":"And ingresa \"e2e@financetrackerpro.com\" en el email del registro desktop","stepMatchArguments":[{"group":{"start":8,"value":"\"e2e@financetrackerpro.com\"","children":[{"start":9,"value":"e2e@financetrackerpro.com","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":59,"gherkinStepLine":67,"keywordType":"Action","textWithKeyword":"And ingresa \"E2ePassword123\" en el campo contraseña del registro desktop","stepMatchArguments":[{"group":{"start":8,"value":"\"E2ePassword123\"","children":[{"start":9,"value":"E2ePassword123","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":60,"gherkinStepLine":68,"keywordType":"Action","textWithKeyword":"And hace clic en \"Registrarse\" en el registro desktop","stepMatchArguments":[{"group":{"start":13,"value":"\"Registrarse\"","children":[{"start":14,"value":"Registrarse","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":61,"gherkinStepLine":69,"keywordType":"Outcome","textWithKeyword":"Then debe ver un mensaje de error en el registro","stepMatchArguments":[]}]},
  {"pwTestLine":64,"pickleLine":72,"tags":["@register","@validation"],"steps":[{"pwStepLine":7,"gherkinStepLine":7,"keywordType":"Context","textWithKeyword":"Given que el usuario navega a la página de login en español","isBg":true,"stepMatchArguments":[]},{"pwStepLine":65,"gherkinStepLine":73,"keywordType":"Action","textWithKeyword":"When cambia a modo registro en desktop","stepMatchArguments":[]},{"pwStepLine":66,"gherkinStepLine":74,"keywordType":"Outcome","textWithKeyword":"Then el botón de registro debe estar deshabilitado","stepMatchArguments":[]},{"pwStepLine":67,"gherkinStepLine":75,"keywordType":"Action","textWithKeyword":"When ingresa \"Test User\" en el campo nombre del registro desktop","stepMatchArguments":[{"group":{"start":8,"value":"\"Test User\"","children":[{"start":9,"value":"Test User","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":68,"gherkinStepLine":76,"keywordType":"Action","textWithKeyword":"And ingresa \"test@test.com\" en el email del registro desktop","stepMatchArguments":[{"group":{"start":8,"value":"\"test@test.com\"","children":[{"start":9,"value":"test@test.com","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":69,"gherkinStepLine":77,"keywordType":"Action","textWithKeyword":"And ingresa \"abc\" en el campo contraseña del registro desktop","stepMatchArguments":[{"group":{"start":8,"value":"\"abc\"","children":[{"start":9,"value":"abc","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":70,"gherkinStepLine":78,"keywordType":"Outcome","textWithKeyword":"Then el botón de registro debe estar deshabilitado","stepMatchArguments":[]},{"pwStepLine":71,"gherkinStepLine":79,"keywordType":"Action","textWithKeyword":"When ingresa \"E2ePassword123\" en el campo contraseña del registro desktop","stepMatchArguments":[{"group":{"start":8,"value":"\"E2ePassword123\"","children":[{"start":9,"value":"E2ePassword123","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":72,"gherkinStepLine":80,"keywordType":"Outcome","textWithKeyword":"Then el botón de registro debe estar habilitado","stepMatchArguments":[]}]},
  {"pwTestLine":75,"pickleLine":83,"tags":["@register","@validation"],"steps":[{"pwStepLine":7,"gherkinStepLine":7,"keywordType":"Context","textWithKeyword":"Given que el usuario navega a la página de login en español","isBg":true,"stepMatchArguments":[]},{"pwStepLine":76,"gherkinStepLine":84,"keywordType":"Action","textWithKeyword":"When cambia a modo registro en desktop","stepMatchArguments":[]},{"pwStepLine":77,"gherkinStepLine":85,"keywordType":"Action","textWithKeyword":"And escribe caracteres en el campo contraseña del registro desktop","stepMatchArguments":[]},{"pwStepLine":78,"gherkinStepLine":86,"keywordType":"Outcome","textWithKeyword":"Then los 4 requisitos de contraseña deben mostrarse sin cumplir","stepMatchArguments":[{"group":{"start":4,"value":"4","children":[]},"parameterTypeName":"int"}]},{"pwStepLine":79,"gherkinStepLine":87,"keywordType":"Action","textWithKeyword":"When ingresa \"E2ePassword123\" en el campo contraseña del registro desktop","stepMatchArguments":[{"group":{"start":8,"value":"\"E2ePassword123\"","children":[{"start":9,"value":"E2ePassword123","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":80,"gherkinStepLine":88,"keywordType":"Outcome","textWithKeyword":"Then los 4 requisitos de contraseña deben estar cumplidos","stepMatchArguments":[{"group":{"start":4,"value":"4","children":[]},"parameterTypeName":"int"}]}]},
  {"pwTestLine":83,"pickleLine":91,"tags":["@register","@validation"],"steps":[{"pwStepLine":7,"gherkinStepLine":7,"keywordType":"Context","textWithKeyword":"Given que el usuario navega a la página de login en español","isBg":true,"stepMatchArguments":[]},{"pwStepLine":84,"gherkinStepLine":92,"keywordType":"Action","textWithKeyword":"When cambia a modo registro en desktop","stepMatchArguments":[]},{"pwStepLine":85,"gherkinStepLine":93,"keywordType":"Action","textWithKeyword":"And intenta enviar el formulario de registro vacío","stepMatchArguments":[]},{"pwStepLine":86,"gherkinStepLine":94,"keywordType":"Outcome","textWithKeyword":"Then la validación HTML5 debe impedir el envío del formulario de registro desktop","stepMatchArguments":[]}]},
  {"pwTestLine":89,"pickleLine":101,"tags":["@i18n"],"steps":[{"pwStepLine":7,"gherkinStepLine":7,"keywordType":"Context","textWithKeyword":"Given que el usuario navega a la página de login en español","isBg":true,"stepMatchArguments":[]},{"pwStepLine":90,"gherkinStepLine":102,"keywordType":"Action","textWithKeyword":"When cambia el idioma a \"English\" en el selector de idioma","stepMatchArguments":[{"group":{"start":19,"value":"\"English\"","children":[{"start":20,"value":"English","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":91,"gherkinStepLine":103,"keywordType":"Outcome","textWithKeyword":"Then los textos del login deben estar en inglés","stepMatchArguments":[]},{"pwStepLine":92,"gherkinStepLine":104,"keywordType":"Outcome","textWithKeyword":"And la URL debe contener \"/en/login\"","stepMatchArguments":[{"group":{"start":21,"value":"\"/en/login\"","children":[{"start":22,"value":"/en/login","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]}]},
  {"pwTestLine":95,"pickleLine":107,"tags":["@i18n"],"steps":[{"pwStepLine":7,"gherkinStepLine":7,"keywordType":"Context","textWithKeyword":"Given que el usuario navega a la página de login en español","isBg":true,"stepMatchArguments":[]},{"pwStepLine":96,"gherkinStepLine":108,"keywordType":"Action","textWithKeyword":"When cambia el idioma a \"English\" en el selector de idioma","stepMatchArguments":[{"group":{"start":19,"value":"\"English\"","children":[{"start":20,"value":"English","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":97,"gherkinStepLine":109,"keywordType":"Outcome","textWithKeyword":"Then los textos del login deben estar en inglés","stepMatchArguments":[]},{"pwStepLine":98,"gherkinStepLine":110,"keywordType":"Action","textWithKeyword":"When ingresa credenciales válidas en el formulario de login desktop","stepMatchArguments":[]},{"pwStepLine":99,"gherkinStepLine":111,"keywordType":"Outcome","textWithKeyword":"Then debe ser redirigido al dashboard con idioma inglés","stepMatchArguments":[]}]},
  {"pwTestLine":102,"pickleLine":118,"tags":["@mobile","@login"],"steps":[{"pwStepLine":7,"gherkinStepLine":7,"keywordType":"Context","textWithKeyword":"Given que el usuario navega a la página de login en español","isBg":true,"stepMatchArguments":[]},{"pwStepLine":103,"gherkinStepLine":119,"keywordType":"Context","textWithKeyword":"Given que la pantalla es móvil 390x844","stepMatchArguments":[{"group":{"start":25,"value":"390","children":[]},"parameterTypeName":"int"},{"group":{"start":29,"value":"844","children":[]},"parameterTypeName":"int"}]},{"pwStepLine":104,"gherkinStepLine":120,"keywordType":"Context","textWithKeyword":"And navega a la página de login en español","stepMatchArguments":[]},{"pwStepLine":105,"gherkinStepLine":121,"keywordType":"Outcome","textWithKeyword":"Then debe ver el formulario de login mobile","stepMatchArguments":[]}]},
  {"pwTestLine":108,"pickleLine":124,"tags":["@mobile","@register"],"steps":[{"pwStepLine":7,"gherkinStepLine":7,"keywordType":"Context","textWithKeyword":"Given que el usuario navega a la página de login en español","isBg":true,"stepMatchArguments":[]},{"pwStepLine":109,"gherkinStepLine":125,"keywordType":"Context","textWithKeyword":"Given que la pantalla es móvil 390x844","stepMatchArguments":[{"group":{"start":25,"value":"390","children":[]},"parameterTypeName":"int"},{"group":{"start":29,"value":"844","children":[]},"parameterTypeName":"int"}]},{"pwStepLine":110,"gherkinStepLine":126,"keywordType":"Context","textWithKeyword":"And navega a la página de login en español","stepMatchArguments":[]},{"pwStepLine":111,"gherkinStepLine":127,"keywordType":"Outcome","textWithKeyword":"Then debe ver el formulario de login mobile","stepMatchArguments":[]},{"pwStepLine":112,"gherkinStepLine":128,"keywordType":"Action","textWithKeyword":"When hace clic en \"Crear Cuenta\" en el toggle mobile","stepMatchArguments":[{"group":{"start":13,"value":"\"Crear Cuenta\"","children":[{"start":14,"value":"Crear Cuenta","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":113,"gherkinStepLine":129,"keywordType":"Outcome","textWithKeyword":"Then debe ver el formulario de registro mobile","stepMatchArguments":[]}]},
]; // bdd-data-end