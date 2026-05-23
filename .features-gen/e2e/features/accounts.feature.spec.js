// Generated from: e2e\features\accounts.feature
import { test } from "playwright-bdd";

test.describe('Gestión de Cuentas Bancarias', () => {

  test('Página de cuentas carga con header y botón de nueva cuenta', { tag: ['@accounts', '@visual', '@happy-path'] }, async ({ Given, When, Then, And, page }) => { 
    await Given('que el usuario de cuentas ha iniciado sesión', null, { page }); 
    await And('que no existen cuentas bancarias', null, { page }); 
    await When('navega a la página de cuentas', null, { page }); 
    await Then('debe ver el título de sección "Cuentas de Banco"', null, { page }); 
    await And('debe ver el botón "Nueva Cuenta" en el encabezado', null, { page }); 
  });

  test('Estado vacío se muestra cuando no hay cuentas', { tag: ['@accounts', '@visual', '@empty-state'] }, async ({ Given, When, Then, And, page }) => { 
    await Given('que el usuario de cuentas ha iniciado sesión', null, { page }); 
    await And('que no existen cuentas bancarias', null, { page }); 
    await When('navega a la página de cuentas', null, { page }); 
    await Then('debe ver el mensaje de empty state "Sin cuentas bancarias"', null, { page }); 
    await And('debe ver el botón "Nueva Cuenta" en el empty state', null, { page }); 
    await And('debe ver el mensaje descriptivo en el empty state', null, { page }); 
  });

  test('Secciones placeholder de Inversiones y Tarjetas son visibles', { tag: ['@accounts', '@visual'] }, async ({ Given, When, Then, And, page }) => { 
    await Given('que el usuario de cuentas ha iniciado sesión', null, { page }); 
    await And('que no existen cuentas bancarias', null, { page }); 
    await When('navega a la página de cuentas', null, { page }); 
    await Then('debe ver la sección "Cuentas de Inversión" con label "En desarrollo"', null, { page }); 
    await And('debe ver la sección "Tarjetas de Crédito" con label "En desarrollo"', null, { page }); 
  });

  test('Sidebar marca Cuentas como activo', { tag: ['@accounts', '@visual', '@navigation'] }, async ({ Given, When, Then, And, page }) => { 
    await Given('que el usuario de cuentas ha iniciado sesión', null, { page }); 
    await And('que no existen cuentas bancarias', null, { page }); 
    await When('navega a la página de cuentas', null, { page }); 
    await Then('el enlace "Cuentas" en el sidebar debe estar marcado como activo', null, { page }); 
  });

  test('Modal de crear cuenta se abre al hacer clic en Nueva Cuenta', { tag: ['@accounts', '@modal', '@create'] }, async ({ Given, When, Then, And, page }) => { 
    await Given('que el usuario de cuentas ha iniciado sesión', null, { page }); 
    await And('que no existen cuentas bancarias', null, { page }); 
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
    await Given('que el usuario de cuentas ha iniciado sesión', null, { page }); 
    await And('que no existen cuentas bancarias', null, { page }); 
    await Given('que el modal de creación está abierto', null, { page }); 
    await When('intenta enviar el formulario vacío', null, { page }); 
    await Then('debe ver errores de validación en el modal', null, { page }); 
    await And('el campo nombre debe estar marcado como inválido', null, { page }); 
  });

  test('Seleccionar tipo SAVINGS muestra campo de tasa de interés', { tag: ['@accounts', '@modal', '@create'] }, async ({ Given, When, Then, And, page }) => { 
    await Given('que el usuario de cuentas ha iniciado sesión', null, { page }); 
    await And('que no existen cuentas bancarias', null, { page }); 
    await Given('que el modal de creación está abierto', null, { page }); 
    await When('selecciona el tipo "Cuenta de Ahorros"', null, { page }); 
    await Then('debe ver el campo de tasa de interés visible', null, { page }); 
    await When('selecciona el tipo "Cuenta Corriente"', null, { page }); 
    await Then('el campo de tasa de interés debe estar oculto', null, { page }); 
  });

  test('Modal se cierra con botón Cancelar', { tag: ['@accounts', '@modal', '@close'] }, async ({ Given, When, Then, And, page }) => { 
    await Given('que el usuario de cuentas ha iniciado sesión', null, { page }); 
    await And('que no existen cuentas bancarias', null, { page }); 
    await Given('que el modal de creación está abierto', null, { page }); 
    await When('cierra el modal con Cancelar', null, { page }); 
    await Then('el modal debe estar cerrado', null, { page }); 
  });

  test('Modal se cierra con tecla Escape', { tag: ['@accounts', '@modal', '@close'] }, async ({ Given, When, Then, And, page }) => { 
    await Given('que el usuario de cuentas ha iniciado sesión', null, { page }); 
    await And('que no existen cuentas bancarias', null, { page }); 
    await Given('que el modal de creación está abierto', null, { page }); 
    await When('presiona Escape en el modal', null, { page }); 
    await Then('el modal debe estar cerrado', null, { page }); 
  });

  test('Crear cuenta exitosa con datos válidos', { tag: ['@accounts', '@create', '@happy-path'] }, async ({ Given, When, Then, And, page }) => { 
    await Given('que el usuario de cuentas ha iniciado sesión', null, { page }); 
    await And('que no existen cuentas bancarias', null, { page }); 
    await Given('que el modal de creación está abierto', null, { page }); 
    await When('ingresa "Mi Cuenta Corriente" en el campo nombre', null, { page }); 
    await And('selecciona el tipo "Cuenta Corriente"', null, { page }); 
    await And('ingresa "1000000" en el campo de saldo inicial', null, { page }); 
    await And('envía el formulario de creación', null, { page }); 
    await Then('la cuenta debe crearse exitosamente', null, { page }); 
    await And('la nueva cuenta debe aparecer en el grid', null, { page }); 
  });

  test('Eliminar cuenta desde el panel de detalle', { tag: ['@accounts', '@delete'] }, async ({ Given, When, Then, And, page }) => { 
    await Given('que el usuario de cuentas ha iniciado sesión', null, { page }); 
    await And('que no existen cuentas bancarias', null, { page }); 
    await Given('que existe una cuenta bancaria', null, { page }); 
    await When('abre el panel de detalle de la cuenta', null, { page }); 
    await Then('debe ver el panel de detalle con la información de la cuenta', null, { page }); 
    await When('hace clic en eliminar en el panel de detalle', null, { page }); 
    await Then('debe ver el modal de confirmación "Eliminar Cuenta"', null, { page }); 
    await When('confirma la eliminación de la cuenta', null, { page }); 
    await Then('la cuenta debe ser eliminada del grid', null, { page }); 
  });

  test('Loading skeleton se muestra durante la carga inicial', { tag: ['@accounts', '@loading', '@skeleton'] }, async ({ Given, When, Then, And, page }) => { 
    await Given('que el usuario de cuentas ha iniciado sesión', null, { page }); 
    await And('que no existen cuentas bancarias', null, { page }); 
    await When('navega a la página de cuentas', null, { page }); 
    await Then('el skeleton de carga puede mostrarse inicialmente', null, { page }); 
    await And('eventualmente el contenido de cuentas debe cargarse', null, { page }); 
  });

  test('Página de cuentas es responsive en viewport móvil', { tag: ['@mobile', '@accounts'] }, async ({ Given, When, Then, And, page }) => { 
    await Given('que el usuario de cuentas ha iniciado sesión', null, { page }); 
    await And('que no existen cuentas bancarias', null, { page }); 
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
  {"pwTestLine":6,"pickleLine":11,"tags":["@accounts","@visual","@happy-path"],"steps":[{"pwStepLine":7,"gherkinStepLine":12,"keywordType":"Context","textWithKeyword":"Given que el usuario de cuentas ha iniciado sesión","stepMatchArguments":[]},{"pwStepLine":8,"gherkinStepLine":13,"keywordType":"Context","textWithKeyword":"And que no existen cuentas bancarias","stepMatchArguments":[]},{"pwStepLine":9,"gherkinStepLine":14,"keywordType":"Action","textWithKeyword":"When navega a la página de cuentas","stepMatchArguments":[]},{"pwStepLine":10,"gherkinStepLine":15,"keywordType":"Outcome","textWithKeyword":"Then debe ver el título de sección \"Cuentas de Banco\"","stepMatchArguments":[{"group":{"start":30,"value":"\"Cuentas de Banco\"","children":[{"start":31,"value":"Cuentas de Banco","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":11,"gherkinStepLine":16,"keywordType":"Outcome","textWithKeyword":"And debe ver el botón \"Nueva Cuenta\" en el encabezado","stepMatchArguments":[{"group":{"start":18,"value":"\"Nueva Cuenta\"","children":[{"start":19,"value":"Nueva Cuenta","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]}]},
  {"pwTestLine":14,"pickleLine":19,"tags":["@accounts","@visual","@empty-state"],"steps":[{"pwStepLine":15,"gherkinStepLine":20,"keywordType":"Context","textWithKeyword":"Given que el usuario de cuentas ha iniciado sesión","stepMatchArguments":[]},{"pwStepLine":16,"gherkinStepLine":21,"keywordType":"Context","textWithKeyword":"And que no existen cuentas bancarias","stepMatchArguments":[]},{"pwStepLine":17,"gherkinStepLine":22,"keywordType":"Action","textWithKeyword":"When navega a la página de cuentas","stepMatchArguments":[]},{"pwStepLine":18,"gherkinStepLine":23,"keywordType":"Outcome","textWithKeyword":"Then debe ver el mensaje de empty state \"Sin cuentas bancarias\"","stepMatchArguments":[{"group":{"start":35,"value":"\"Sin cuentas bancarias\"","children":[{"start":36,"value":"Sin cuentas bancarias","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":19,"gherkinStepLine":24,"keywordType":"Outcome","textWithKeyword":"And debe ver el botón \"Nueva Cuenta\" en el empty state","stepMatchArguments":[{"group":{"start":18,"value":"\"Nueva Cuenta\"","children":[{"start":19,"value":"Nueva Cuenta","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":20,"gherkinStepLine":25,"keywordType":"Outcome","textWithKeyword":"And debe ver el mensaje descriptivo en el empty state","stepMatchArguments":[]}]},
  {"pwTestLine":23,"pickleLine":28,"tags":["@accounts","@visual"],"steps":[{"pwStepLine":24,"gherkinStepLine":29,"keywordType":"Context","textWithKeyword":"Given que el usuario de cuentas ha iniciado sesión","stepMatchArguments":[]},{"pwStepLine":25,"gherkinStepLine":30,"keywordType":"Context","textWithKeyword":"And que no existen cuentas bancarias","stepMatchArguments":[]},{"pwStepLine":26,"gherkinStepLine":31,"keywordType":"Action","textWithKeyword":"When navega a la página de cuentas","stepMatchArguments":[]},{"pwStepLine":27,"gherkinStepLine":32,"keywordType":"Outcome","textWithKeyword":"Then debe ver la sección \"Cuentas de Inversión\" con label \"En desarrollo\"","stepMatchArguments":[{"group":{"start":20,"value":"\"Cuentas de Inversión\"","children":[{"start":21,"value":"Cuentas de Inversión","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"},{"group":{"start":53,"value":"\"En desarrollo\"","children":[{"start":54,"value":"En desarrollo","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":28,"gherkinStepLine":33,"keywordType":"Outcome","textWithKeyword":"And debe ver la sección \"Tarjetas de Crédito\" con label \"En desarrollo\"","stepMatchArguments":[{"group":{"start":20,"value":"\"Tarjetas de Crédito\"","children":[{"start":21,"value":"Tarjetas de Crédito","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"},{"group":{"start":52,"value":"\"En desarrollo\"","children":[{"start":53,"value":"En desarrollo","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]}]},
  {"pwTestLine":31,"pickleLine":36,"tags":["@accounts","@visual","@navigation"],"steps":[{"pwStepLine":32,"gherkinStepLine":37,"keywordType":"Context","textWithKeyword":"Given que el usuario de cuentas ha iniciado sesión","stepMatchArguments":[]},{"pwStepLine":33,"gherkinStepLine":38,"keywordType":"Context","textWithKeyword":"And que no existen cuentas bancarias","stepMatchArguments":[]},{"pwStepLine":34,"gherkinStepLine":39,"keywordType":"Action","textWithKeyword":"When navega a la página de cuentas","stepMatchArguments":[]},{"pwStepLine":35,"gherkinStepLine":40,"keywordType":"Outcome","textWithKeyword":"Then el enlace \"Cuentas\" en el sidebar debe estar marcado como activo","stepMatchArguments":[{"group":{"start":10,"value":"\"Cuentas\"","children":[{"start":11,"value":"Cuentas","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]}]},
  {"pwTestLine":38,"pickleLine":47,"tags":["@accounts","@modal","@create"],"steps":[{"pwStepLine":39,"gherkinStepLine":48,"keywordType":"Context","textWithKeyword":"Given que el usuario de cuentas ha iniciado sesión","stepMatchArguments":[]},{"pwStepLine":40,"gherkinStepLine":49,"keywordType":"Context","textWithKeyword":"And que no existen cuentas bancarias","stepMatchArguments":[]},{"pwStepLine":41,"gherkinStepLine":50,"keywordType":"Action","textWithKeyword":"When navega a la página de cuentas","stepMatchArguments":[]},{"pwStepLine":42,"gherkinStepLine":51,"keywordType":"Action","textWithKeyword":"And abre el modal de nueva cuenta","stepMatchArguments":[]},{"pwStepLine":43,"gherkinStepLine":52,"keywordType":"Outcome","textWithKeyword":"Then debe ver el modal de creación con título \"Nueva Cuenta\"","stepMatchArguments":[{"group":{"start":41,"value":"\"Nueva Cuenta\"","children":[{"start":42,"value":"Nueva Cuenta","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":44,"gherkinStepLine":53,"keywordType":"Outcome","textWithKeyword":"And debe ver el campo \"Nombre de la Cuenta\" en el modal","stepMatchArguments":[{"group":{"start":18,"value":"\"Nombre de la Cuenta\"","children":[{"start":19,"value":"Nombre de la Cuenta","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":45,"gherkinStepLine":54,"keywordType":"Outcome","textWithKeyword":"And debe ver el campo \"Tipo de Cuenta\" en el modal","stepMatchArguments":[{"group":{"start":18,"value":"\"Tipo de Cuenta\"","children":[{"start":19,"value":"Tipo de Cuenta","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":46,"gherkinStepLine":55,"keywordType":"Outcome","textWithKeyword":"And debe ver el campo \"Moneda\" en el modal","stepMatchArguments":[{"group":{"start":18,"value":"\"Moneda\"","children":[{"start":19,"value":"Moneda","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":47,"gherkinStepLine":56,"keywordType":"Outcome","textWithKeyword":"And debe ver el campo \"Saldo Inicial\" en el modal","stepMatchArguments":[{"group":{"start":18,"value":"\"Saldo Inicial\"","children":[{"start":19,"value":"Saldo Inicial","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":48,"gherkinStepLine":57,"keywordType":"Outcome","textWithKeyword":"And debe ver el botón \"Cancelar\" en el modal","stepMatchArguments":[{"group":{"start":18,"value":"\"Cancelar\"","children":[{"start":19,"value":"Cancelar","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":49,"gherkinStepLine":58,"keywordType":"Outcome","textWithKeyword":"And debe ver el botón \"Crear Cuenta\" en el modal","stepMatchArguments":[{"group":{"start":18,"value":"\"Crear Cuenta\"","children":[{"start":19,"value":"Crear Cuenta","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]}]},
  {"pwTestLine":52,"pickleLine":61,"tags":["@accounts","@modal","@validation"],"steps":[{"pwStepLine":53,"gherkinStepLine":62,"keywordType":"Context","textWithKeyword":"Given que el usuario de cuentas ha iniciado sesión","stepMatchArguments":[]},{"pwStepLine":54,"gherkinStepLine":63,"keywordType":"Context","textWithKeyword":"And que no existen cuentas bancarias","stepMatchArguments":[]},{"pwStepLine":55,"gherkinStepLine":64,"keywordType":"Context","textWithKeyword":"Given que el modal de creación está abierto","stepMatchArguments":[]},{"pwStepLine":56,"gherkinStepLine":65,"keywordType":"Action","textWithKeyword":"When intenta enviar el formulario vacío","stepMatchArguments":[]},{"pwStepLine":57,"gherkinStepLine":66,"keywordType":"Outcome","textWithKeyword":"Then debe ver errores de validación en el modal","stepMatchArguments":[]},{"pwStepLine":58,"gherkinStepLine":67,"keywordType":"Outcome","textWithKeyword":"And el campo nombre debe estar marcado como inválido","stepMatchArguments":[]}]},
  {"pwTestLine":61,"pickleLine":70,"tags":["@accounts","@modal","@create"],"steps":[{"pwStepLine":62,"gherkinStepLine":71,"keywordType":"Context","textWithKeyword":"Given que el usuario de cuentas ha iniciado sesión","stepMatchArguments":[]},{"pwStepLine":63,"gherkinStepLine":72,"keywordType":"Context","textWithKeyword":"And que no existen cuentas bancarias","stepMatchArguments":[]},{"pwStepLine":64,"gherkinStepLine":73,"keywordType":"Context","textWithKeyword":"Given que el modal de creación está abierto","stepMatchArguments":[]},{"pwStepLine":65,"gherkinStepLine":74,"keywordType":"Action","textWithKeyword":"When selecciona el tipo \"Cuenta de Ahorros\"","stepMatchArguments":[{"group":{"start":19,"value":"\"Cuenta de Ahorros\"","children":[{"start":20,"value":"Cuenta de Ahorros","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":66,"gherkinStepLine":75,"keywordType":"Outcome","textWithKeyword":"Then debe ver el campo de tasa de interés visible","stepMatchArguments":[]},{"pwStepLine":67,"gherkinStepLine":76,"keywordType":"Action","textWithKeyword":"When selecciona el tipo \"Cuenta Corriente\"","stepMatchArguments":[{"group":{"start":19,"value":"\"Cuenta Corriente\"","children":[{"start":20,"value":"Cuenta Corriente","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":68,"gherkinStepLine":77,"keywordType":"Outcome","textWithKeyword":"Then el campo de tasa de interés debe estar oculto","stepMatchArguments":[]}]},
  {"pwTestLine":71,"pickleLine":80,"tags":["@accounts","@modal","@close"],"steps":[{"pwStepLine":72,"gherkinStepLine":81,"keywordType":"Context","textWithKeyword":"Given que el usuario de cuentas ha iniciado sesión","stepMatchArguments":[]},{"pwStepLine":73,"gherkinStepLine":82,"keywordType":"Context","textWithKeyword":"And que no existen cuentas bancarias","stepMatchArguments":[]},{"pwStepLine":74,"gherkinStepLine":83,"keywordType":"Context","textWithKeyword":"Given que el modal de creación está abierto","stepMatchArguments":[]},{"pwStepLine":75,"gherkinStepLine":84,"keywordType":"Action","textWithKeyword":"When cierra el modal con Cancelar","stepMatchArguments":[]},{"pwStepLine":76,"gherkinStepLine":85,"keywordType":"Outcome","textWithKeyword":"Then el modal debe estar cerrado","stepMatchArguments":[]}]},
  {"pwTestLine":79,"pickleLine":88,"tags":["@accounts","@modal","@close"],"steps":[{"pwStepLine":80,"gherkinStepLine":89,"keywordType":"Context","textWithKeyword":"Given que el usuario de cuentas ha iniciado sesión","stepMatchArguments":[]},{"pwStepLine":81,"gherkinStepLine":90,"keywordType":"Context","textWithKeyword":"And que no existen cuentas bancarias","stepMatchArguments":[]},{"pwStepLine":82,"gherkinStepLine":91,"keywordType":"Context","textWithKeyword":"Given que el modal de creación está abierto","stepMatchArguments":[]},{"pwStepLine":83,"gherkinStepLine":92,"keywordType":"Action","textWithKeyword":"When presiona Escape en el modal","stepMatchArguments":[]},{"pwStepLine":84,"gherkinStepLine":93,"keywordType":"Outcome","textWithKeyword":"Then el modal debe estar cerrado","stepMatchArguments":[]}]},
  {"pwTestLine":87,"pickleLine":100,"tags":["@accounts","@create","@happy-path"],"steps":[{"pwStepLine":88,"gherkinStepLine":101,"keywordType":"Context","textWithKeyword":"Given que el usuario de cuentas ha iniciado sesión","stepMatchArguments":[]},{"pwStepLine":89,"gherkinStepLine":102,"keywordType":"Context","textWithKeyword":"And que no existen cuentas bancarias","stepMatchArguments":[]},{"pwStepLine":90,"gherkinStepLine":103,"keywordType":"Context","textWithKeyword":"Given que el modal de creación está abierto","stepMatchArguments":[]},{"pwStepLine":91,"gherkinStepLine":104,"keywordType":"Action","textWithKeyword":"When ingresa \"Mi Cuenta Corriente\" en el campo nombre","stepMatchArguments":[{"group":{"start":8,"value":"\"Mi Cuenta Corriente\"","children":[{"start":9,"value":"Mi Cuenta Corriente","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":92,"gherkinStepLine":105,"keywordType":"Action","textWithKeyword":"And selecciona el tipo \"Cuenta Corriente\"","stepMatchArguments":[{"group":{"start":19,"value":"\"Cuenta Corriente\"","children":[{"start":20,"value":"Cuenta Corriente","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":93,"gherkinStepLine":106,"keywordType":"Action","textWithKeyword":"And ingresa \"1000000\" en el campo de saldo inicial","stepMatchArguments":[{"group":{"start":8,"value":"\"1000000\"","children":[{"start":9,"value":"1000000","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":94,"gherkinStepLine":107,"keywordType":"Action","textWithKeyword":"And envía el formulario de creación","stepMatchArguments":[]},{"pwStepLine":95,"gherkinStepLine":108,"keywordType":"Outcome","textWithKeyword":"Then la cuenta debe crearse exitosamente","stepMatchArguments":[]},{"pwStepLine":96,"gherkinStepLine":109,"keywordType":"Outcome","textWithKeyword":"And la nueva cuenta debe aparecer en el grid","stepMatchArguments":[]}]},
  {"pwTestLine":99,"pickleLine":116,"tags":["@accounts","@delete"],"steps":[{"pwStepLine":100,"gherkinStepLine":117,"keywordType":"Context","textWithKeyword":"Given que el usuario de cuentas ha iniciado sesión","stepMatchArguments":[]},{"pwStepLine":101,"gherkinStepLine":118,"keywordType":"Context","textWithKeyword":"And que no existen cuentas bancarias","stepMatchArguments":[]},{"pwStepLine":102,"gherkinStepLine":119,"keywordType":"Context","textWithKeyword":"Given que existe una cuenta bancaria","stepMatchArguments":[]},{"pwStepLine":103,"gherkinStepLine":120,"keywordType":"Action","textWithKeyword":"When abre el panel de detalle de la cuenta","stepMatchArguments":[]},{"pwStepLine":104,"gherkinStepLine":121,"keywordType":"Outcome","textWithKeyword":"Then debe ver el panel de detalle con la información de la cuenta","stepMatchArguments":[]},{"pwStepLine":105,"gherkinStepLine":122,"keywordType":"Action","textWithKeyword":"When hace clic en eliminar en el panel de detalle","stepMatchArguments":[]},{"pwStepLine":106,"gherkinStepLine":123,"keywordType":"Outcome","textWithKeyword":"Then debe ver el modal de confirmación \"Eliminar Cuenta\"","stepMatchArguments":[{"group":{"start":34,"value":"\"Eliminar Cuenta\"","children":[{"start":35,"value":"Eliminar Cuenta","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":107,"gherkinStepLine":124,"keywordType":"Action","textWithKeyword":"When confirma la eliminación de la cuenta","stepMatchArguments":[]},{"pwStepLine":108,"gherkinStepLine":125,"keywordType":"Outcome","textWithKeyword":"Then la cuenta debe ser eliminada del grid","stepMatchArguments":[]}]},
  {"pwTestLine":111,"pickleLine":132,"tags":["@accounts","@loading","@skeleton"],"steps":[{"pwStepLine":112,"gherkinStepLine":133,"keywordType":"Context","textWithKeyword":"Given que el usuario de cuentas ha iniciado sesión","stepMatchArguments":[]},{"pwStepLine":113,"gherkinStepLine":134,"keywordType":"Context","textWithKeyword":"And que no existen cuentas bancarias","stepMatchArguments":[]},{"pwStepLine":114,"gherkinStepLine":135,"keywordType":"Action","textWithKeyword":"When navega a la página de cuentas","stepMatchArguments":[]},{"pwStepLine":115,"gherkinStepLine":136,"keywordType":"Outcome","textWithKeyword":"Then el skeleton de carga puede mostrarse inicialmente","stepMatchArguments":[]},{"pwStepLine":116,"gherkinStepLine":137,"keywordType":"Outcome","textWithKeyword":"And eventualmente el contenido de cuentas debe cargarse","stepMatchArguments":[]}]},
  {"pwTestLine":119,"pickleLine":144,"tags":["@mobile","@accounts"],"steps":[{"pwStepLine":120,"gherkinStepLine":145,"keywordType":"Context","textWithKeyword":"Given que el usuario de cuentas ha iniciado sesión","stepMatchArguments":[]},{"pwStepLine":121,"gherkinStepLine":146,"keywordType":"Context","textWithKeyword":"And que no existen cuentas bancarias","stepMatchArguments":[]},{"pwStepLine":122,"gherkinStepLine":147,"keywordType":"Context","textWithKeyword":"Given que la pantalla es móvil 390x844","stepMatchArguments":[{"group":{"start":25,"value":"390","children":[]},"parameterTypeName":"int"},{"group":{"start":29,"value":"844","children":[]},"parameterTypeName":"int"}]},{"pwStepLine":123,"gherkinStepLine":148,"keywordType":"Action","textWithKeyword":"When navega a la página de cuentas","stepMatchArguments":[]},{"pwStepLine":124,"gherkinStepLine":149,"keywordType":"Outcome","textWithKeyword":"Then la página de cuentas debe mostrarse correctamente en mobile","stepMatchArguments":[]}]},
]; // bdd-data-end