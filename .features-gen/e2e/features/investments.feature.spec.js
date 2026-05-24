// Generated from: e2e\features\investments.feature
import { test } from "playwright-bdd";

test.describe('Gestión de Cuentas de Inversión — Visual y Modal', () => {

  test('Página de inversiones carga con header y estado vacío', { tag: ['@investments', '@visual', '@happy-path'] }, async ({ Given, When, Then, And, page }) => { 
    await Given('que el usuario de inversiones ha iniciado sesión', null, { page }); 
    await When('navega a la página de inversiones', null, { page }); 
    await Then('debe ver el título de sección "Inversiones"', null, { page }); 
    await And('debe ver el mensaje de empty state "Sin cuentas de inversión"', null, { page }); 
    await And('debe ver el botón "Nueva Cuenta de Inversión" en el empty state', null, { page }); 
  });

  test('Sidebar marca Inversiones como activo', { tag: ['@investments', '@visual', '@navigation'] }, async ({ Given, When, Then, page }) => { 
    await Given('que el usuario de inversiones ha iniciado sesión', null, { page }); 
    await Given('que la pantalla es de escritorio', null, { page }); 
    await When('navega a la página de inversiones', null, { page }); 
    await Then('el enlace "Inversiones" en el sidebar debe estar marcado como activo', null, { page }); 
  });

  test('Modal de crear cuenta de inversión se abre', { tag: ['@investments', '@modal', '@create'] }, async ({ Given, When, Then, And, page }) => { 
    await Given('que el usuario de inversiones ha iniciado sesión', null, { page }); 
    await When('navega a la página de inversiones', null, { page }); 
    await And('abre el modal de nueva cuenta de inversión', null, { page }); 
    await Then('debe ver el modal de inversión con título "Nueva Cuenta de Inversión"', null, { page }); 
    await And('debe ver el campo "Nombre de la Cuenta" en el modal', null, { page }); 
    await And('debe ver el campo "Moneda" en el modal', null, { page }); 
    await And('debe ver el campo "Saldo Inicial" en el modal', null, { page }); 
    await And('debe ver el botón "Cancelar" en el modal', null, { page }); 
    await And('debe ver el botón "Crear Cuenta" en el modal', null, { page }); 
  });

  test('Validación del formulario de creación de inversión', { tag: ['@investments', '@modal', '@validation'] }, async ({ Given, When, Then, And, page }) => { 
    await Given('que el usuario de inversiones ha iniciado sesión', null, { page }); 
    await When('navega a la página de inversiones', null, { page }); 
    await And('abre el modal de nueva cuenta de inversión', null, { page }); 
    await And('intenta enviar el formulario de inversión vacío', null, { page }); 
    await Then('debe ver errores de validación en el modal', null, { page }); 
  });

  test('Página de inversiones es responsive en viewport móvil', { tag: ['@investments', '@mobile'] }, async ({ Given, When, Then, And, page }) => { 
    await Given('que el usuario de inversiones ha iniciado sesión', null, { page }); 
    await Given('que la pantalla es móvil 390x844', null, { page }); 
    await When('navega a la página de inversiones', null, { page }); 
    await Then('debe ver el título "Inversiones"', null, { page }); 
    await And('la página de inversiones debe mostrarse correctamente en mobile', null, { page }); 
  });

});

// == technical section ==

test.use({
  $test: [({}, use) => use(test), { scope: 'test', box: true }],
  $uri: [({}, use) => use('e2e\\features\\investments.feature'), { scope: 'test', box: true }],
  $bddFileData: [({}, use) => use(bddFileData), { scope: "test", box: true }],
});

const bddFileData = [ // bdd-data-start
  {"pwTestLine":6,"pickleLine":11,"tags":["@investments","@visual","@happy-path"],"steps":[{"pwStepLine":7,"gherkinStepLine":12,"keywordType":"Context","textWithKeyword":"Given que el usuario de inversiones ha iniciado sesión","stepMatchArguments":[]},{"pwStepLine":8,"gherkinStepLine":13,"keywordType":"Action","textWithKeyword":"When navega a la página de inversiones","stepMatchArguments":[]},{"pwStepLine":9,"gherkinStepLine":14,"keywordType":"Outcome","textWithKeyword":"Then debe ver el título de sección \"Inversiones\"","stepMatchArguments":[{"group":{"start":30,"value":"\"Inversiones\"","children":[{"start":31,"value":"Inversiones","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":10,"gherkinStepLine":15,"keywordType":"Outcome","textWithKeyword":"And debe ver el mensaje de empty state \"Sin cuentas de inversión\"","stepMatchArguments":[{"group":{"start":35,"value":"\"Sin cuentas de inversión\"","children":[{"start":36,"value":"Sin cuentas de inversión","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":11,"gherkinStepLine":16,"keywordType":"Outcome","textWithKeyword":"And debe ver el botón \"Nueva Cuenta de Inversión\" en el empty state","stepMatchArguments":[{"group":{"start":18,"value":"\"Nueva Cuenta de Inversión\"","children":[{"start":19,"value":"Nueva Cuenta de Inversión","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]}]},
  {"pwTestLine":14,"pickleLine":19,"tags":["@investments","@visual","@navigation"],"steps":[{"pwStepLine":15,"gherkinStepLine":20,"keywordType":"Context","textWithKeyword":"Given que el usuario de inversiones ha iniciado sesión","stepMatchArguments":[]},{"pwStepLine":16,"gherkinStepLine":21,"keywordType":"Context","textWithKeyword":"Given que la pantalla es de escritorio","stepMatchArguments":[]},{"pwStepLine":17,"gherkinStepLine":22,"keywordType":"Action","textWithKeyword":"When navega a la página de inversiones","stepMatchArguments":[]},{"pwStepLine":18,"gherkinStepLine":23,"keywordType":"Outcome","textWithKeyword":"Then el enlace \"Inversiones\" en el sidebar debe estar marcado como activo","stepMatchArguments":[{"group":{"start":10,"value":"\"Inversiones\"","children":[{"start":11,"value":"Inversiones","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]}]},
  {"pwTestLine":21,"pickleLine":30,"tags":["@investments","@modal","@create"],"steps":[{"pwStepLine":22,"gherkinStepLine":31,"keywordType":"Context","textWithKeyword":"Given que el usuario de inversiones ha iniciado sesión","stepMatchArguments":[]},{"pwStepLine":23,"gherkinStepLine":32,"keywordType":"Action","textWithKeyword":"When navega a la página de inversiones","stepMatchArguments":[]},{"pwStepLine":24,"gherkinStepLine":33,"keywordType":"Action","textWithKeyword":"And abre el modal de nueva cuenta de inversión","stepMatchArguments":[]},{"pwStepLine":25,"gherkinStepLine":34,"keywordType":"Outcome","textWithKeyword":"Then debe ver el modal de inversión con título \"Nueva Cuenta de Inversión\"","stepMatchArguments":[{"group":{"start":42,"value":"\"Nueva Cuenta de Inversión\"","children":[{"start":43,"value":"Nueva Cuenta de Inversión","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":26,"gherkinStepLine":35,"keywordType":"Outcome","textWithKeyword":"And debe ver el campo \"Nombre de la Cuenta\" en el modal","stepMatchArguments":[{"group":{"start":18,"value":"\"Nombre de la Cuenta\"","children":[{"start":19,"value":"Nombre de la Cuenta","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":27,"gherkinStepLine":36,"keywordType":"Outcome","textWithKeyword":"And debe ver el campo \"Moneda\" en el modal","stepMatchArguments":[{"group":{"start":18,"value":"\"Moneda\"","children":[{"start":19,"value":"Moneda","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":28,"gherkinStepLine":37,"keywordType":"Outcome","textWithKeyword":"And debe ver el campo \"Saldo Inicial\" en el modal","stepMatchArguments":[{"group":{"start":18,"value":"\"Saldo Inicial\"","children":[{"start":19,"value":"Saldo Inicial","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":29,"gherkinStepLine":38,"keywordType":"Outcome","textWithKeyword":"And debe ver el botón \"Cancelar\" en el modal","stepMatchArguments":[{"group":{"start":18,"value":"\"Cancelar\"","children":[{"start":19,"value":"Cancelar","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":30,"gherkinStepLine":39,"keywordType":"Outcome","textWithKeyword":"And debe ver el botón \"Crear Cuenta\" en el modal","stepMatchArguments":[{"group":{"start":18,"value":"\"Crear Cuenta\"","children":[{"start":19,"value":"Crear Cuenta","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]}]},
  {"pwTestLine":33,"pickleLine":42,"tags":["@investments","@modal","@validation"],"steps":[{"pwStepLine":34,"gherkinStepLine":43,"keywordType":"Context","textWithKeyword":"Given que el usuario de inversiones ha iniciado sesión","stepMatchArguments":[]},{"pwStepLine":35,"gherkinStepLine":44,"keywordType":"Action","textWithKeyword":"When navega a la página de inversiones","stepMatchArguments":[]},{"pwStepLine":36,"gherkinStepLine":45,"keywordType":"Action","textWithKeyword":"And abre el modal de nueva cuenta de inversión","stepMatchArguments":[]},{"pwStepLine":37,"gherkinStepLine":46,"keywordType":"Action","textWithKeyword":"And intenta enviar el formulario de inversión vacío","stepMatchArguments":[]},{"pwStepLine":38,"gherkinStepLine":47,"keywordType":"Outcome","textWithKeyword":"Then debe ver errores de validación en el modal","stepMatchArguments":[]}]},
  {"pwTestLine":41,"pickleLine":54,"tags":["@investments","@mobile"],"steps":[{"pwStepLine":42,"gherkinStepLine":55,"keywordType":"Context","textWithKeyword":"Given que el usuario de inversiones ha iniciado sesión","stepMatchArguments":[]},{"pwStepLine":43,"gherkinStepLine":56,"keywordType":"Context","textWithKeyword":"Given que la pantalla es móvil 390x844","stepMatchArguments":[{"group":{"start":25,"value":"390","children":[]},"parameterTypeName":"int"},{"group":{"start":29,"value":"844","children":[]},"parameterTypeName":"int"}]},{"pwStepLine":44,"gherkinStepLine":57,"keywordType":"Action","textWithKeyword":"When navega a la página de inversiones","stepMatchArguments":[]},{"pwStepLine":45,"gherkinStepLine":58,"keywordType":"Outcome","textWithKeyword":"Then debe ver el título \"Inversiones\"","stepMatchArguments":[{"group":{"start":19,"value":"\"Inversiones\"","children":[{"start":20,"value":"Inversiones","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":46,"gherkinStepLine":59,"keywordType":"Outcome","textWithKeyword":"And la página de inversiones debe mostrarse correctamente en mobile","stepMatchArguments":[]}]},
]; // bdd-data-end