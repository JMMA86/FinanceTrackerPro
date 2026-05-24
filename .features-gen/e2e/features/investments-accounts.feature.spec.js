// Generated from: e2e\features\investments-accounts.feature
import { test } from "playwright-bdd";

test.describe('Gestión de Cuentas de Inversión — Transacciones', () => {

  test('Crear cuenta de inversión exitosa con USD', { tag: ['@investments', '@create', '@happy-path'] }, async ({ Given, When, Then, And, page }) => { 
    await Given('que el usuario de inversiones ha iniciado sesión', null, { page }); 
    await When('navega a la página de inversiones', null, { page }); 
    await And('abre el modal de nueva cuenta de inversión', null, { page }); 
    await And('ingresa "Mi Inversión USA" en el nombre de la inversión', null, { page }); 
    await And('selecciona "USD" como moneda de inversión', null, { page }); 
    await And('ingresa "500000" en el saldo inicial de inversión', null, { page }); 
    await And('envía el formulario de creación de inversión', null, { page }); 
    await Then('la cuenta de inversión debe crearse exitosamente', null, { page }); 
    await And('la nueva cuenta de inversión debe aparecer en el grid', null, { page }); 
    await And('la tarjeta debe mostrar el nombre "Mi Inversión USA"', null, { page }); 
    await And('la tarjeta debe mostrar un balance positivo', null, { page }); 
  });

  test('Modal de depósito se abre con datos correctos', { tag: ['@investments', '@modal', '@deposit'] }, async ({ Given, When, Then, And, page }) => { 
    await Given('que el usuario de inversiones ha iniciado sesión', null, { page }); 
    await Given('que existe una cuenta de inversión con saldo', null, { page }); 
    await When('navega a la página de inversiones', null, { page }); 
    await And('hace clic en "Depositar" en la página de inversiones', null, { page }); 
    await Then('debe ver el modal de depósito con título "Depositar a Inversión"', null, { page }); 
    await And('debe ver el campo "Cuenta de Origen (COP)" en el modal', null, { page }); 
    await And('debe ver el campo "Cuenta de Destino" en el modal', null, { page }); 
    await And('debe ver el campo "Monto en COP" en el modal', null, { page }); 
    await And('debe ver el campo "Tasa de Cambio" en el modal', null, { page }); 
  });

  test('Depositar a cuenta de inversión con tasa de cambio', { tag: ['@investments', '@deposit', '@happy-path'] }, async ({ Given, When, Then, And, page }) => { 
    await Given('que el usuario de inversiones ha iniciado sesión', null, { page }); 
    await Given('que existe una cuenta de inversión con saldo', null, { page }); 
    await When('navega a la página de inversiones', null, { page }); 
    await And('abre el modal de depósito de inversión', null, { page }); 
    await And('selecciona la cuenta bancaria COP en el depósito', null, { page }); 
    await And('ingresa "500000" en el monto COP de depósito', null, { page }); 
    await And('ingresa "4000" como tasa de cambio', null, { page }); 
    await Then('debe ver el estimado de recibo en el modal', null, { page }); 
    await When('envía el formulario de depósito', null, { page }); 
    await Then('el modal de depósito debe cerrarse', null, { page }); 
    await And('la tarjeta de inversión debe mostrar balance actualizado', null, { page }); 
  });

  test('Modal de compra de activo se abre y muestra búsqueda', { tag: ['@investments', '@search', '@buy'] }, async ({ Given, When, Then, And, page }) => { 
    await Given('que el usuario de inversiones ha iniciado sesión', null, { page }); 
    await Given('que existe una cuenta de inversión con saldo suficiente', null, { page }); 
    await When('navega a la página de inversiones', null, { page }); 
    await And('selecciona la cuenta de inversión "Mi Inversión USA"', null, { page }); 
    await Then('debe ver el botón "Comprar Activo" visible en la página', null, { page }); 
    await When('hace clic en "Comprar Activo"', null, { page }); 
    await Then('debe ver el modal de compra con título "Comprar Activo"', null, { page }); 
    await And('debe ver el campo de búsqueda de acciones', null, { page }); 
    await And('debe ver el saldo disponible de la cuenta', null, { page }); 
  });

  test('Búsqueda de acciones en el modal', { tag: ['@investments', '@search', '@result'] }, async ({ Given, When, Then, And, page }) => { 
    await Given('que el usuario de inversiones ha iniciado sesión', null, { page }); 
    await Given('que existe una cuenta de inversión con saldo suficiente', null, { page }); 
    await When('navega a la página de inversiones', null, { page }); 
    await And('selecciona la cuenta de inversión "Mi Inversión USA"', null, { page }); 
    await And('abre el modal de compra de activo', null, { page }); 
    await When('escribe "AAPL" en el buscador de acciones', null, { page }); 
    await Then('debe ver resultados de búsqueda o mensaje de error', null, { page }); 
  });

  test('Portafolio muestra empty state cuando no hay posiciones', { tag: ['@investments', '@portfolio', '@visual'] }, async ({ Given, When, Then, And, page }) => { 
    await Given('que el usuario de inversiones ha iniciado sesión', null, { page }); 
    await Given('que existe una cuenta de inversión con saldo', null, { page }); 
    await When('navega a la página de inversiones', null, { page }); 
    await And('selecciona la cuenta de inversión "Mi Inversión USA"', null, { page }); 
    await Then('debe ver la sección de posiciones vacía "Sin posiciones abiertas"', null, { page }); 
    await And('debe ver la sección de transacciones de la inversión', null, { page }); 
  });

});

// == technical section ==

test.use({
  $test: [({}, use) => use(test), { scope: 'test', box: true }],
  $uri: [({}, use) => use('e2e\\features\\investments-accounts.feature'), { scope: 'test', box: true }],
  $bddFileData: [({}, use) => use(bddFileData), { scope: "test", box: true }],
});

const bddFileData = [ // bdd-data-start
  {"pwTestLine":6,"pickleLine":11,"tags":["@investments","@create","@happy-path"],"steps":[{"pwStepLine":7,"gherkinStepLine":12,"keywordType":"Context","textWithKeyword":"Given que el usuario de inversiones ha iniciado sesión","stepMatchArguments":[]},{"pwStepLine":8,"gherkinStepLine":13,"keywordType":"Action","textWithKeyword":"When navega a la página de inversiones","stepMatchArguments":[]},{"pwStepLine":9,"gherkinStepLine":14,"keywordType":"Action","textWithKeyword":"And abre el modal de nueva cuenta de inversión","stepMatchArguments":[]},{"pwStepLine":10,"gherkinStepLine":15,"keywordType":"Action","textWithKeyword":"And ingresa \"Mi Inversión USA\" en el nombre de la inversión","stepMatchArguments":[{"group":{"start":8,"value":"\"Mi Inversión USA\"","children":[{"start":9,"value":"Mi Inversión USA","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":11,"gherkinStepLine":16,"keywordType":"Action","textWithKeyword":"And selecciona \"USD\" como moneda de inversión","stepMatchArguments":[{"group":{"start":11,"value":"\"USD\"","children":[{"start":12,"value":"USD","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":12,"gherkinStepLine":17,"keywordType":"Action","textWithKeyword":"And ingresa \"500000\" en el saldo inicial de inversión","stepMatchArguments":[{"group":{"start":8,"value":"\"500000\"","children":[{"start":9,"value":"500000","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":13,"gherkinStepLine":18,"keywordType":"Action","textWithKeyword":"And envía el formulario de creación de inversión","stepMatchArguments":[]},{"pwStepLine":14,"gherkinStepLine":19,"keywordType":"Outcome","textWithKeyword":"Then la cuenta de inversión debe crearse exitosamente","stepMatchArguments":[]},{"pwStepLine":15,"gherkinStepLine":20,"keywordType":"Outcome","textWithKeyword":"And la nueva cuenta de inversión debe aparecer en el grid","stepMatchArguments":[]},{"pwStepLine":16,"gherkinStepLine":21,"keywordType":"Outcome","textWithKeyword":"And la tarjeta debe mostrar el nombre \"Mi Inversión USA\"","stepMatchArguments":[{"group":{"start":34,"value":"\"Mi Inversión USA\"","children":[{"start":35,"value":"Mi Inversión USA","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":17,"gherkinStepLine":22,"keywordType":"Outcome","textWithKeyword":"And la tarjeta debe mostrar un balance positivo","stepMatchArguments":[]}]},
  {"pwTestLine":20,"pickleLine":29,"tags":["@investments","@modal","@deposit"],"steps":[{"pwStepLine":21,"gherkinStepLine":30,"keywordType":"Context","textWithKeyword":"Given que el usuario de inversiones ha iniciado sesión","stepMatchArguments":[]},{"pwStepLine":22,"gherkinStepLine":31,"keywordType":"Context","textWithKeyword":"Given que existe una cuenta de inversión con saldo","stepMatchArguments":[]},{"pwStepLine":23,"gherkinStepLine":32,"keywordType":"Action","textWithKeyword":"When navega a la página de inversiones","stepMatchArguments":[]},{"pwStepLine":24,"gherkinStepLine":33,"keywordType":"Action","textWithKeyword":"And hace clic en \"Depositar\" en la página de inversiones","stepMatchArguments":[{"group":{"start":13,"value":"\"Depositar\"","children":[{"start":14,"value":"Depositar","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":25,"gherkinStepLine":34,"keywordType":"Outcome","textWithKeyword":"Then debe ver el modal de depósito con título \"Depositar a Inversión\"","stepMatchArguments":[{"group":{"start":41,"value":"\"Depositar a Inversión\"","children":[{"start":42,"value":"Depositar a Inversión","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":26,"gherkinStepLine":35,"keywordType":"Outcome","textWithKeyword":"And debe ver el campo \"Cuenta de Origen (COP)\" en el modal","stepMatchArguments":[{"group":{"start":18,"value":"\"Cuenta de Origen (COP)\"","children":[{"start":19,"value":"Cuenta de Origen (COP)","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":27,"gherkinStepLine":36,"keywordType":"Outcome","textWithKeyword":"And debe ver el campo \"Cuenta de Destino\" en el modal","stepMatchArguments":[{"group":{"start":18,"value":"\"Cuenta de Destino\"","children":[{"start":19,"value":"Cuenta de Destino","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":28,"gherkinStepLine":37,"keywordType":"Outcome","textWithKeyword":"And debe ver el campo \"Monto en COP\" en el modal","stepMatchArguments":[{"group":{"start":18,"value":"\"Monto en COP\"","children":[{"start":19,"value":"Monto en COP","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":29,"gherkinStepLine":38,"keywordType":"Outcome","textWithKeyword":"And debe ver el campo \"Tasa de Cambio\" en el modal","stepMatchArguments":[{"group":{"start":18,"value":"\"Tasa de Cambio\"","children":[{"start":19,"value":"Tasa de Cambio","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]}]},
  {"pwTestLine":32,"pickleLine":41,"tags":["@investments","@deposit","@happy-path"],"steps":[{"pwStepLine":33,"gherkinStepLine":42,"keywordType":"Context","textWithKeyword":"Given que el usuario de inversiones ha iniciado sesión","stepMatchArguments":[]},{"pwStepLine":34,"gherkinStepLine":43,"keywordType":"Context","textWithKeyword":"Given que existe una cuenta de inversión con saldo","stepMatchArguments":[]},{"pwStepLine":35,"gherkinStepLine":44,"keywordType":"Action","textWithKeyword":"When navega a la página de inversiones","stepMatchArguments":[]},{"pwStepLine":36,"gherkinStepLine":45,"keywordType":"Action","textWithKeyword":"And abre el modal de depósito de inversión","stepMatchArguments":[]},{"pwStepLine":37,"gherkinStepLine":46,"keywordType":"Action","textWithKeyword":"And selecciona la cuenta bancaria COP en el depósito","stepMatchArguments":[]},{"pwStepLine":38,"gherkinStepLine":47,"keywordType":"Action","textWithKeyword":"And ingresa \"500000\" en el monto COP de depósito","stepMatchArguments":[{"group":{"start":8,"value":"\"500000\"","children":[{"start":9,"value":"500000","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":39,"gherkinStepLine":48,"keywordType":"Action","textWithKeyword":"And ingresa \"4000\" como tasa de cambio","stepMatchArguments":[{"group":{"start":8,"value":"\"4000\"","children":[{"start":9,"value":"4000","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":40,"gherkinStepLine":49,"keywordType":"Outcome","textWithKeyword":"Then debe ver el estimado de recibo en el modal","stepMatchArguments":[]},{"pwStepLine":41,"gherkinStepLine":50,"keywordType":"Action","textWithKeyword":"When envía el formulario de depósito","stepMatchArguments":[]},{"pwStepLine":42,"gherkinStepLine":51,"keywordType":"Outcome","textWithKeyword":"Then el modal de depósito debe cerrarse","stepMatchArguments":[]},{"pwStepLine":43,"gherkinStepLine":52,"keywordType":"Outcome","textWithKeyword":"And la tarjeta de inversión debe mostrar balance actualizado","stepMatchArguments":[]}]},
  {"pwTestLine":46,"pickleLine":59,"tags":["@investments","@search","@buy"],"steps":[{"pwStepLine":47,"gherkinStepLine":60,"keywordType":"Context","textWithKeyword":"Given que el usuario de inversiones ha iniciado sesión","stepMatchArguments":[]},{"pwStepLine":48,"gherkinStepLine":61,"keywordType":"Context","textWithKeyword":"Given que existe una cuenta de inversión con saldo suficiente","stepMatchArguments":[]},{"pwStepLine":49,"gherkinStepLine":62,"keywordType":"Action","textWithKeyword":"When navega a la página de inversiones","stepMatchArguments":[]},{"pwStepLine":50,"gherkinStepLine":63,"keywordType":"Action","textWithKeyword":"And selecciona la cuenta de inversión \"Mi Inversión USA\"","stepMatchArguments":[{"group":{"start":34,"value":"\"Mi Inversión USA\"","children":[{"start":35,"value":"Mi Inversión USA","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":51,"gherkinStepLine":64,"keywordType":"Outcome","textWithKeyword":"Then debe ver el botón \"Comprar Activo\" visible en la página","stepMatchArguments":[{"group":{"start":18,"value":"\"Comprar Activo\"","children":[{"start":19,"value":"Comprar Activo","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":52,"gherkinStepLine":65,"keywordType":"Action","textWithKeyword":"When hace clic en \"Comprar Activo\"","stepMatchArguments":[{"group":{"start":13,"value":"\"Comprar Activo\"","children":[{"start":14,"value":"Comprar Activo","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":53,"gherkinStepLine":66,"keywordType":"Outcome","textWithKeyword":"Then debe ver el modal de compra con título \"Comprar Activo\"","stepMatchArguments":[{"group":{"start":39,"value":"\"Comprar Activo\"","children":[{"start":40,"value":"Comprar Activo","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":54,"gherkinStepLine":67,"keywordType":"Outcome","textWithKeyword":"And debe ver el campo de búsqueda de acciones","stepMatchArguments":[]},{"pwStepLine":55,"gherkinStepLine":68,"keywordType":"Outcome","textWithKeyword":"And debe ver el saldo disponible de la cuenta","stepMatchArguments":[]}]},
  {"pwTestLine":58,"pickleLine":71,"tags":["@investments","@search","@result"],"steps":[{"pwStepLine":59,"gherkinStepLine":72,"keywordType":"Context","textWithKeyword":"Given que el usuario de inversiones ha iniciado sesión","stepMatchArguments":[]},{"pwStepLine":60,"gherkinStepLine":73,"keywordType":"Context","textWithKeyword":"Given que existe una cuenta de inversión con saldo suficiente","stepMatchArguments":[]},{"pwStepLine":61,"gherkinStepLine":74,"keywordType":"Action","textWithKeyword":"When navega a la página de inversiones","stepMatchArguments":[]},{"pwStepLine":62,"gherkinStepLine":75,"keywordType":"Action","textWithKeyword":"And selecciona la cuenta de inversión \"Mi Inversión USA\"","stepMatchArguments":[{"group":{"start":34,"value":"\"Mi Inversión USA\"","children":[{"start":35,"value":"Mi Inversión USA","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":63,"gherkinStepLine":76,"keywordType":"Action","textWithKeyword":"And abre el modal de compra de activo","stepMatchArguments":[]},{"pwStepLine":64,"gherkinStepLine":77,"keywordType":"Action","textWithKeyword":"When escribe \"AAPL\" en el buscador de acciones","stepMatchArguments":[{"group":{"start":8,"value":"\"AAPL\"","children":[{"start":9,"value":"AAPL","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":65,"gherkinStepLine":78,"keywordType":"Outcome","textWithKeyword":"Then debe ver resultados de búsqueda o mensaje de error","stepMatchArguments":[]}]},
  {"pwTestLine":68,"pickleLine":85,"tags":["@investments","@portfolio","@visual"],"steps":[{"pwStepLine":69,"gherkinStepLine":86,"keywordType":"Context","textWithKeyword":"Given que el usuario de inversiones ha iniciado sesión","stepMatchArguments":[]},{"pwStepLine":70,"gherkinStepLine":87,"keywordType":"Context","textWithKeyword":"Given que existe una cuenta de inversión con saldo","stepMatchArguments":[]},{"pwStepLine":71,"gherkinStepLine":88,"keywordType":"Action","textWithKeyword":"When navega a la página de inversiones","stepMatchArguments":[]},{"pwStepLine":72,"gherkinStepLine":89,"keywordType":"Action","textWithKeyword":"And selecciona la cuenta de inversión \"Mi Inversión USA\"","stepMatchArguments":[{"group":{"start":34,"value":"\"Mi Inversión USA\"","children":[{"start":35,"value":"Mi Inversión USA","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":73,"gherkinStepLine":90,"keywordType":"Outcome","textWithKeyword":"Then debe ver la sección de posiciones vacía \"Sin posiciones abiertas\"","stepMatchArguments":[{"group":{"start":40,"value":"\"Sin posiciones abiertas\"","children":[{"start":41,"value":"Sin posiciones abiertas","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":74,"gherkinStepLine":91,"keywordType":"Outcome","textWithKeyword":"And debe ver la sección de transacciones de la inversión","stepMatchArguments":[]}]},
]; // bdd-data-end