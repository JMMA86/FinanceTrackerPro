// Generated from: e2e\features\accounts.feature
import { test } from "playwright-bdd";

test.describe('Gestión de Cuentas Bancarias', () => {

  test.beforeEach('Background', async ({ Given, page }, testInfo) => { if (testInfo.error) return;
    await Given('que el usuario ha iniciado sesión', null, { page }); 
  });
  
  test('Página de cuentas carga con header y botón de nueva cuenta', { tag: ['@accounts', '@visual', '@happy-path'] }, async ({ When, Then, And, page }) => { 
    await When('navega a la página de cuentas', null, { page }); 
    await Then('debe ver el título de sección "Cuentas de Banco"', null, { page }); 
    await And('debe ver el botón "Nueva Cuenta" en el encabezado', null, { page }); 
  });

  test('Estado vacío se muestra cuando no hay cuentas', { tag: ['@accounts', '@visual', '@empty-state'] }, async ({ When, Then, And, page }) => { 
    await When('navega a la página de cuentas', null, { page }); 
    await Then('debe ver el mensaje de empty state "Sin cuentas bancarias"', null, { page }); 
    await And('debe ver el botón "Nueva Cuenta" en el empty state', null, { page }); 
    await And('debe ver el mensaje descriptivo en el empty state', null, { page }); 
  });

  test('Secciones placeholder de Inversiones y Tarjetas son visibles', { tag: ['@accounts', '@visual'] }, async ({ When, Then, And, page }) => { 
    await When('navega a la página de cuentas', null, { page }); 
    await Then('debe ver la sección "Cuentas de Inversión" con label "En desarrollo"', null, { page }); 
    await And('debe ver la sección "Tarjetas de Crédito" con label "En desarrollo"', null, { page }); 
  });

  test('Sidebar marca Cuentas como activo', { tag: ['@accounts', '@visual', '@navigation'] }, async ({ When, Then, page }) => { 
    await When('navega a la página de cuentas', null, { page }); 
    await Then('el enlace "Cuentas" en el sidebar debe estar marcado como activo', null, { page }); 
  });

  test('Modal de crear cuenta se abre al hacer clic en Nueva Cuenta', { tag: ['@accounts', '@modal', '@create'] }, async ({ When, Then, And, page }) => { 
    await When('navega a la página de cuentas', null, { page }); 
    await And('abre el modal de nueva cuenta', null, { page }); 
    await Then('debe ver el modal de creación con título "Nueva Cuenta"', null, { page }); 
    await And('debe ver el campo "Nombre de la Cuenta" en el modal', null, { page }); 
    await And('debe ver el campo "Tipo de Cuenta" en el modal', null, { page }); 
    await And('debe ver el campo "Moneda" en el modal', null, { page }); 
    await And('debe ver el campo "Saldo Inicial" en el modal', null, { page }); 
    await And('debe ver el botón "Cancelar" en el modal', null, { page }); 
    await And('debe ver el botón "Crear Cuenta" en el modal', null, { page }); 
  });

  test('Formulario de crear cuenta valida campos requeridos', { tag: ['@accounts', '@modal', '@validation'] }, async ({ Given, When, Then, And, page }) => { 
    await Given('que el modal de creación está abierto', null, { page }); 
    await When('intenta enviar el formulario vacío', null, { page }); 
    await Then('debe ver errores de validación en el modal', null, { page }); 
    await And('el campo nombre debe estar marcado como inválido', null, { page }); 
  });

  test('Seleccionar tipo SAVINGS muestra campo de tasa de interés', { tag: ['@accounts', '@modal', '@create'] }, async ({ Given, When, Then, page }) => { 
    await Given('que el modal de creación está abierto', null, { page }); 
    await When('selecciona el tipo "Cuenta de Ahorros"', null, { page }); 
    await Then('debe ver el campo de tasa de interés visible', null, { page }); 
    await When('selecciona el tipo "Cuenta Corriente"', null, { page }); 
    await Then('el campo de tasa de interés debe estar oculto', null, { page }); 
  });

  test('Modal se cierra con botón Cancelar', { tag: ['@accounts', '@modal', '@close'] }, async ({ Given, When, Then, page }) => { 
    await Given('que el modal de creación está abierto', null, { page }); 
    await When('cierra el modal con Cancelar', null, { page }); 
    await Then('el modal debe estar cerrado', null, { page }); 
  });

  test('Modal se cierra con tecla Escape', { tag: ['@accounts', '@modal', '@close'] }, async ({ Given, When, Then, page }) => { 
    await Given('que el modal de creación está abierto', null, { page }); 
    await When('presiona Escape en el modal', null, { page }); 
    await Then('el modal debe estar cerrado', null, { page }); 
  });

  test('Crear cuenta exitosa con datos válidos', { tag: ['@accounts', '@create', '@happy-path'] }, async ({ Given, When, Then, And, page }) => { 
    await Given('que el modal de creación está abierto', null, { page }); 
    await When('ingresa "Mi Cuenta Corriente" en el campo nombre', null, { page }); 
    await And('selecciona el tipo "Cuenta Corriente"', null, { page }); 
    await And('ingresa "1000000" en el campo de saldo inicial', null, { page }); 
    await And('envía el formulario de creación', null, { page }); 
    await Then('la cuenta debe crearse exitosamente', null, { page }); 
    await And('la nueva cuenta debe aparecer en el grid', null, { page }); 
  });

  test('Eliminar cuenta desde el panel de detalle', { tag: ['@accounts', '@delete'] }, async ({ Given, When, Then, page }) => { 
    await Given('que existe una cuenta bancaria', null, { page }); 
    await When('abre el panel de detalle de la cuenta', null, { page }); 
    await Then('debe ver el panel de detalle con la información de la cuenta', null, { page }); 
    await When('hace clic en eliminar en el panel de detalle', null, { page }); 
    await Then('debe ver el modal de confirmación "Eliminar Cuenta"', null, { page }); 
    await When('confirma la eliminación de la cuenta', null, { page }); 
    await Then('la cuenta debe ser eliminada del grid', null, { page }); 
  });

  test('Loading skeleton se muestra durante la carga inicial', { tag: ['@accounts', '@loading', '@skeleton'] }, async ({ When, Then, And, page }) => { 
    await When('navega a la página de cuentas', null, { page }); 
    await Then('el skeleton de carga puede mostrarse inicialmente', null, { page }); 
    await And('eventualmente el contenido de cuentas debe cargarse', null, { page }); 
  });

  test('Página de cuentas es responsive en viewport móvil', { tag: ['@mobile', '@accounts'] }, async ({ Given, When, Then, page }) => { 
    await Given('que la pantalla es móvil 390x844', null, { page }); 
    await When('navega a la página de cuentas', null, { page }); 
    await Then('la página de cuentas debe mostrarse correctamente en mobile', null, { page }); 
  });

});

// == technical section ==

test.use({
  $test: [({}, use) => use(test), { scope: 'test', box: true }],
  $uri: [({}, use) => use('e2e\\features\\accounts.feature'), { scope: 'test', box: true }],
  $bddFileData: [({}, use) => use(bddFileData), { scope: "test", box: true }],
});

const bddFileData = [ // bdd-data-start
  {"pwTestLine":10,"pickleLine":14,"tags":["@accounts","@visual","@happy-path"],"steps":[{"pwStepLine":7,"gherkinStepLine":7,"keywordType":"Context","textWithKeyword":"Given que el usuario ha iniciado sesión","isBg":true,"stepMatchArguments":[]},{"pwStepLine":11,"gherkinStepLine":15,"keywordType":"Action","textWithKeyword":"When navega a la página de cuentas","stepMatchArguments":[]},{"pwStepLine":12,"gherkinStepLine":16,"keywordType":"Outcome","textWithKeyword":"Then debe ver el título de sección \"Cuentas de Banco\"","stepMatchArguments":[{"group":{"start":30,"value":"\"Cuentas de Banco\"","children":[{"start":31,"value":"Cuentas de Banco","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":13,"gherkinStepLine":17,"keywordType":"Outcome","textWithKeyword":"And debe ver el botón \"Nueva Cuenta\" en el encabezado","stepMatchArguments":[{"group":{"start":18,"value":"\"Nueva Cuenta\"","children":[{"start":19,"value":"Nueva Cuenta","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]}]},
  {"pwTestLine":16,"pickleLine":20,"tags":["@accounts","@visual","@empty-state"],"steps":[{"pwStepLine":7,"gherkinStepLine":7,"keywordType":"Context","textWithKeyword":"Given que el usuario ha iniciado sesión","isBg":true,"stepMatchArguments":[]},{"pwStepLine":17,"gherkinStepLine":21,"keywordType":"Action","textWithKeyword":"When navega a la página de cuentas","stepMatchArguments":[]},{"pwStepLine":18,"gherkinStepLine":22,"keywordType":"Outcome","textWithKeyword":"Then debe ver el mensaje de empty state \"Sin cuentas bancarias\"","stepMatchArguments":[{"group":{"start":35,"value":"\"Sin cuentas bancarias\"","children":[{"start":36,"value":"Sin cuentas bancarias","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":19,"gherkinStepLine":23,"keywordType":"Outcome","textWithKeyword":"And debe ver el botón \"Nueva Cuenta\" en el empty state","stepMatchArguments":[{"group":{"start":18,"value":"\"Nueva Cuenta\"","children":[{"start":19,"value":"Nueva Cuenta","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":20,"gherkinStepLine":24,"keywordType":"Outcome","textWithKeyword":"And debe ver el mensaje descriptivo en el empty state","stepMatchArguments":[]}]},
  {"pwTestLine":23,"pickleLine":27,"tags":["@accounts","@visual"],"steps":[{"pwStepLine":7,"gherkinStepLine":7,"keywordType":"Context","textWithKeyword":"Given que el usuario ha iniciado sesión","isBg":true,"stepMatchArguments":[]},{"pwStepLine":24,"gherkinStepLine":28,"keywordType":"Action","textWithKeyword":"When navega a la página de cuentas","stepMatchArguments":[]},{"pwStepLine":25,"gherkinStepLine":29,"keywordType":"Outcome","textWithKeyword":"Then debe ver la sección \"Cuentas de Inversión\" con label \"En desarrollo\"","stepMatchArguments":[{"group":{"start":20,"value":"\"Cuentas de Inversión\"","children":[{"start":21,"value":"Cuentas de Inversión","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"},{"group":{"start":53,"value":"\"En desarrollo\"","children":[{"start":54,"value":"En desarrollo","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":26,"gherkinStepLine":30,"keywordType":"Outcome","textWithKeyword":"And debe ver la sección \"Tarjetas de Crédito\" con label \"En desarrollo\"","stepMatchArguments":[{"group":{"start":20,"value":"\"Tarjetas de Crédito\"","children":[{"start":21,"value":"Tarjetas de Crédito","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"},{"group":{"start":52,"value":"\"En desarrollo\"","children":[{"start":53,"value":"En desarrollo","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]}]},
  {"pwTestLine":29,"pickleLine":33,"tags":["@accounts","@visual","@navigation"],"steps":[{"pwStepLine":7,"gherkinStepLine":7,"keywordType":"Context","textWithKeyword":"Given que el usuario ha iniciado sesión","isBg":true,"stepMatchArguments":[]},{"pwStepLine":30,"gherkinStepLine":34,"keywordType":"Action","textWithKeyword":"When navega a la página de cuentas","stepMatchArguments":[]},{"pwStepLine":31,"gherkinStepLine":35,"keywordType":"Outcome","textWithKeyword":"Then el enlace \"Cuentas\" en el sidebar debe estar marcado como activo","stepMatchArguments":[{"group":{"start":10,"value":"\"Cuentas\"","children":[{"start":11,"value":"Cuentas","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]}]},
  {"pwTestLine":34,"pickleLine":42,"tags":["@accounts","@modal","@create"],"steps":[{"pwStepLine":7,"gherkinStepLine":7,"keywordType":"Context","textWithKeyword":"Given que el usuario ha iniciado sesión","isBg":true,"stepMatchArguments":[]},{"pwStepLine":35,"gherkinStepLine":43,"keywordType":"Action","textWithKeyword":"When navega a la página de cuentas","stepMatchArguments":[]},{"pwStepLine":36,"gherkinStepLine":44,"keywordType":"Action","textWithKeyword":"And abre el modal de nueva cuenta","stepMatchArguments":[]},{"pwStepLine":37,"gherkinStepLine":45,"keywordType":"Outcome","textWithKeyword":"Then debe ver el modal de creación con título \"Nueva Cuenta\"","stepMatchArguments":[{"group":{"start":41,"value":"\"Nueva Cuenta\"","children":[{"start":42,"value":"Nueva Cuenta","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":38,"gherkinStepLine":46,"keywordType":"Outcome","textWithKeyword":"And debe ver el campo \"Nombre de la Cuenta\" en el modal","stepMatchArguments":[{"group":{"start":18,"value":"\"Nombre de la Cuenta\"","children":[{"start":19,"value":"Nombre de la Cuenta","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":39,"gherkinStepLine":47,"keywordType":"Outcome","textWithKeyword":"And debe ver el campo \"Tipo de Cuenta\" en el modal","stepMatchArguments":[{"group":{"start":18,"value":"\"Tipo de Cuenta\"","children":[{"start":19,"value":"Tipo de Cuenta","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":40,"gherkinStepLine":48,"keywordType":"Outcome","textWithKeyword":"And debe ver el campo \"Moneda\" en el modal","stepMatchArguments":[{"group":{"start":18,"value":"\"Moneda\"","children":[{"start":19,"value":"Moneda","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":41,"gherkinStepLine":49,"keywordType":"Outcome","textWithKeyword":"And debe ver el campo \"Saldo Inicial\" en el modal","stepMatchArguments":[{"group":{"start":18,"value":"\"Saldo Inicial\"","children":[{"start":19,"value":"Saldo Inicial","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":42,"gherkinStepLine":50,"keywordType":"Outcome","textWithKeyword":"And debe ver el botón \"Cancelar\" en el modal","stepMatchArguments":[{"group":{"start":18,"value":"\"Cancelar\"","children":[{"start":19,"value":"Cancelar","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":43,"gherkinStepLine":51,"keywordType":"Outcome","textWithKeyword":"And debe ver el botón \"Crear Cuenta\" en el modal","stepMatchArguments":[{"group":{"start":18,"value":"\"Crear Cuenta\"","children":[{"start":19,"value":"Crear Cuenta","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]}]},
  {"pwTestLine":46,"pickleLine":54,"tags":["@accounts","@modal","@validation"],"steps":[{"pwStepLine":7,"gherkinStepLine":7,"keywordType":"Context","textWithKeyword":"Given que el usuario ha iniciado sesión","isBg":true,"stepMatchArguments":[]},{"pwStepLine":47,"gherkinStepLine":55,"keywordType":"Context","textWithKeyword":"Given que el modal de creación está abierto","stepMatchArguments":[]},{"pwStepLine":48,"gherkinStepLine":56,"keywordType":"Action","textWithKeyword":"When intenta enviar el formulario vacío","stepMatchArguments":[]},{"pwStepLine":49,"gherkinStepLine":57,"keywordType":"Outcome","textWithKeyword":"Then debe ver errores de validación en el modal","stepMatchArguments":[]},{"pwStepLine":50,"gherkinStepLine":58,"keywordType":"Outcome","textWithKeyword":"And el campo nombre debe estar marcado como inválido","stepMatchArguments":[]}]},
  {"pwTestLine":53,"pickleLine":61,"tags":["@accounts","@modal","@create"],"steps":[{"pwStepLine":7,"gherkinStepLine":7,"keywordType":"Context","textWithKeyword":"Given que el usuario ha iniciado sesión","isBg":true,"stepMatchArguments":[]},{"pwStepLine":54,"gherkinStepLine":62,"keywordType":"Context","textWithKeyword":"Given que el modal de creación está abierto","stepMatchArguments":[]},{"pwStepLine":55,"gherkinStepLine":63,"keywordType":"Action","textWithKeyword":"When selecciona el tipo \"Cuenta de Ahorros\"","stepMatchArguments":[{"group":{"start":19,"value":"\"Cuenta de Ahorros\"","children":[{"start":20,"value":"Cuenta de Ahorros","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":56,"gherkinStepLine":64,"keywordType":"Outcome","textWithKeyword":"Then debe ver el campo de tasa de interés visible","stepMatchArguments":[]},{"pwStepLine":57,"gherkinStepLine":65,"keywordType":"Action","textWithKeyword":"When selecciona el tipo \"Cuenta Corriente\"","stepMatchArguments":[{"group":{"start":19,"value":"\"Cuenta Corriente\"","children":[{"start":20,"value":"Cuenta Corriente","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":58,"gherkinStepLine":66,"keywordType":"Outcome","textWithKeyword":"Then el campo de tasa de interés debe estar oculto","stepMatchArguments":[]}]},
  {"pwTestLine":61,"pickleLine":69,"tags":["@accounts","@modal","@close"],"steps":[{"pwStepLine":7,"gherkinStepLine":7,"keywordType":"Context","textWithKeyword":"Given que el usuario ha iniciado sesión","isBg":true,"stepMatchArguments":[]},{"pwStepLine":62,"gherkinStepLine":70,"keywordType":"Context","textWithKeyword":"Given que el modal de creación está abierto","stepMatchArguments":[]},{"pwStepLine":63,"gherkinStepLine":71,"keywordType":"Action","textWithKeyword":"When cierra el modal con Cancelar","stepMatchArguments":[]},{"pwStepLine":64,"gherkinStepLine":72,"keywordType":"Outcome","textWithKeyword":"Then el modal debe estar cerrado","stepMatchArguments":[]}]},
  {"pwTestLine":67,"pickleLine":75,"tags":["@accounts","@modal","@close"],"steps":[{"pwStepLine":7,"gherkinStepLine":7,"keywordType":"Context","textWithKeyword":"Given que el usuario ha iniciado sesión","isBg":true,"stepMatchArguments":[]},{"pwStepLine":68,"gherkinStepLine":76,"keywordType":"Context","textWithKeyword":"Given que el modal de creación está abierto","stepMatchArguments":[]},{"pwStepLine":69,"gherkinStepLine":77,"keywordType":"Action","textWithKeyword":"When presiona Escape en el modal","stepMatchArguments":[]},{"pwStepLine":70,"gherkinStepLine":78,"keywordType":"Outcome","textWithKeyword":"Then el modal debe estar cerrado","stepMatchArguments":[]}]},
  {"pwTestLine":73,"pickleLine":85,"tags":["@accounts","@create","@happy-path"],"steps":[{"pwStepLine":7,"gherkinStepLine":7,"keywordType":"Context","textWithKeyword":"Given que el usuario ha iniciado sesión","isBg":true,"stepMatchArguments":[]},{"pwStepLine":74,"gherkinStepLine":86,"keywordType":"Context","textWithKeyword":"Given que el modal de creación está abierto","stepMatchArguments":[]},{"pwStepLine":75,"gherkinStepLine":87,"keywordType":"Action","textWithKeyword":"When ingresa \"Mi Cuenta Corriente\" en el campo nombre","stepMatchArguments":[{"group":{"start":8,"value":"\"Mi Cuenta Corriente\"","children":[{"start":9,"value":"Mi Cuenta Corriente","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":76,"gherkinStepLine":88,"keywordType":"Action","textWithKeyword":"And selecciona el tipo \"Cuenta Corriente\"","stepMatchArguments":[{"group":{"start":19,"value":"\"Cuenta Corriente\"","children":[{"start":20,"value":"Cuenta Corriente","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":77,"gherkinStepLine":89,"keywordType":"Action","textWithKeyword":"And ingresa \"1000000\" en el campo de saldo inicial","stepMatchArguments":[{"group":{"start":8,"value":"\"1000000\"","children":[{"start":9,"value":"1000000","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":78,"gherkinStepLine":90,"keywordType":"Action","textWithKeyword":"And envía el formulario de creación","stepMatchArguments":[]},{"pwStepLine":79,"gherkinStepLine":91,"keywordType":"Outcome","textWithKeyword":"Then la cuenta debe crearse exitosamente","stepMatchArguments":[]},{"pwStepLine":80,"gherkinStepLine":92,"keywordType":"Outcome","textWithKeyword":"And la nueva cuenta debe aparecer en el grid","stepMatchArguments":[]}]},
  {"pwTestLine":83,"pickleLine":99,"tags":["@accounts","@delete"],"steps":[{"pwStepLine":7,"gherkinStepLine":7,"keywordType":"Context","textWithKeyword":"Given que el usuario ha iniciado sesión","isBg":true,"stepMatchArguments":[]},{"pwStepLine":84,"gherkinStepLine":100,"keywordType":"Context","textWithKeyword":"Given que existe una cuenta bancaria","stepMatchArguments":[]},{"pwStepLine":85,"gherkinStepLine":101,"keywordType":"Action","textWithKeyword":"When abre el panel de detalle de la cuenta","stepMatchArguments":[]},{"pwStepLine":86,"gherkinStepLine":102,"keywordType":"Outcome","textWithKeyword":"Then debe ver el panel de detalle con la información de la cuenta","stepMatchArguments":[]},{"pwStepLine":87,"gherkinStepLine":103,"keywordType":"Action","textWithKeyword":"When hace clic en eliminar en el panel de detalle","stepMatchArguments":[]},{"pwStepLine":88,"gherkinStepLine":104,"keywordType":"Outcome","textWithKeyword":"Then debe ver el modal de confirmación \"Eliminar Cuenta\"","stepMatchArguments":[{"group":{"start":34,"value":"\"Eliminar Cuenta\"","children":[{"start":35,"value":"Eliminar Cuenta","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":89,"gherkinStepLine":105,"keywordType":"Action","textWithKeyword":"When confirma la eliminación de la cuenta","stepMatchArguments":[]},{"pwStepLine":90,"gherkinStepLine":106,"keywordType":"Outcome","textWithKeyword":"Then la cuenta debe ser eliminada del grid","stepMatchArguments":[]}]},
  {"pwTestLine":93,"pickleLine":113,"tags":["@accounts","@loading","@skeleton"],"steps":[{"pwStepLine":7,"gherkinStepLine":7,"keywordType":"Context","textWithKeyword":"Given que el usuario ha iniciado sesión","isBg":true,"stepMatchArguments":[]},{"pwStepLine":94,"gherkinStepLine":114,"keywordType":"Action","textWithKeyword":"When navega a la página de cuentas","stepMatchArguments":[]},{"pwStepLine":95,"gherkinStepLine":115,"keywordType":"Outcome","textWithKeyword":"Then el skeleton de carga puede mostrarse inicialmente","stepMatchArguments":[]},{"pwStepLine":96,"gherkinStepLine":116,"keywordType":"Outcome","textWithKeyword":"And eventualmente el contenido de cuentas debe cargarse","stepMatchArguments":[]}]},
  {"pwTestLine":99,"pickleLine":123,"tags":["@mobile","@accounts"],"steps":[{"pwStepLine":7,"gherkinStepLine":7,"keywordType":"Context","textWithKeyword":"Given que el usuario ha iniciado sesión","isBg":true,"stepMatchArguments":[]},{"pwStepLine":100,"gherkinStepLine":124,"keywordType":"Context","textWithKeyword":"Given que la pantalla es móvil 390x844","stepMatchArguments":[{"group":{"start":25,"value":"390","children":[]},"parameterTypeName":"int"},{"group":{"start":29,"value":"844","children":[]},"parameterTypeName":"int"}]},{"pwStepLine":101,"gherkinStepLine":125,"keywordType":"Action","textWithKeyword":"When navega a la página de cuentas","stepMatchArguments":[]},{"pwStepLine":102,"gherkinStepLine":126,"keywordType":"Outcome","textWithKeyword":"Then la página de cuentas debe mostrarse correctamente en mobile","stepMatchArguments":[]}]},
]; // bdd-data-end