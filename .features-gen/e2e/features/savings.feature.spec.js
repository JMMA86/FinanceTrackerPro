// Generated from: e2e\features\savings.feature
import { test } from "playwright-bdd";

test.describe('Gestión de Metas de Ahorro — Savings Goals', () => {

  test('Empty savings page shows create prompt', { tag: ['@savings', '@empty', '@visual'] }, async ({ Given, When, Then, page }) => { 
    await Given('que el usuario de ahorros ha iniciado sesión', null, { page }); 
    await Given('que no tiene metas de ahorro', null, { page }); 
    await When('navega a la página de ahorros', null, { page }); 
    await Then('debe ver el título de sección "Ahorros"', null, { page }); 
    await Then('debe ver el mensaje de empty state "No tienes metas de ahorro"', null, { page }); 
    await Then('debe ver el botón "Nueva Meta" en el empty state', null, { page }); 
  });

  test('Summary cards display correctly with active and completed goals', { tag: ['@savings', '@summary', '@visual'] }, async ({ Given, When, Then, page }) => { 
    await Given('que el usuario de ahorros ha iniciado sesión', null, { page }); 
    await Given('que tiene metas de ahorro activas y completadas', null, { page }); 
    await When('navega a la página de ahorros', null, { page }); 
    await Then('debe ver la tarjeta "Total Ahorrado"', null, { page }); 
    await Then('debe ver la tarjeta "Meta Total"', null, { page }); 
    await Then('debe ver la tarjeta "Progreso General"', null, { page }); 
    await Then('debe ver la tarjeta "Disponible para Gastar"', null, { page }); 
  });

  test('Max spendable card displays breakdown', { tag: ['@savings', '@spendable', '@visual'] }, async ({ Given, When, Then, page }) => { 
    await Given('que el usuario de ahorros ha iniciado sesión', null, { page }); 
    await Given('que tiene metas de ahorro activas y completadas', null, { page }); 
    await When('navega a la página de ahorros', null, { page }); 
    await Then('debe ver la tarjeta "Disponible para Gastar" con desglose', null, { page }); 
    await Then('debe ver la sección "Ingresos" en el desglose', null, { page }); 
    await Then('debe ver la sección "Gastos Fijos" en el desglose', null, { page }); 
    await Then('debe ver la sección "Compromisos de Ahorro" en el desglose', null, { page }); 
    await Then('debe ver la sección "Gastos Variables" en el desglose', null, { page }); 
  });

});

// == technical section ==

test.use({
  $test: [({}, use) => use(test), { scope: 'test', box: true }],
  $uri: [({}, use) => use('e2e\\features\\savings.feature'), { scope: 'test', box: true }],
  $bddFileData: [({}, use) => use(bddFileData), { scope: "test", box: true }],
});

const bddFileData = [ // bdd-data-start
  {"pwTestLine":6,"pickleLine":11,"tags":["@savings","@empty","@visual"],"steps":[{"pwStepLine":7,"gherkinStepLine":12,"keywordType":"Context","textWithKeyword":"Given que el usuario de ahorros ha iniciado sesión","stepMatchArguments":[]},{"pwStepLine":8,"gherkinStepLine":13,"keywordType":"Context","textWithKeyword":"Given que no tiene metas de ahorro","stepMatchArguments":[]},{"pwStepLine":9,"gherkinStepLine":14,"keywordType":"Action","textWithKeyword":"When navega a la página de ahorros","stepMatchArguments":[]},{"pwStepLine":10,"gherkinStepLine":15,"keywordType":"Outcome","textWithKeyword":"Then debe ver el título de sección \"Ahorros\"","stepMatchArguments":[{"group":{"start":30,"value":"\"Ahorros\"","children":[{"start":31,"value":"Ahorros","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":11,"gherkinStepLine":16,"keywordType":"Outcome","textWithKeyword":"Then debe ver el mensaje de empty state \"No tienes metas de ahorro\"","stepMatchArguments":[{"group":{"start":35,"value":"\"No tienes metas de ahorro\"","children":[{"start":36,"value":"No tienes metas de ahorro","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":12,"gherkinStepLine":17,"keywordType":"Outcome","textWithKeyword":"Then debe ver el botón \"Nueva Meta\" en el empty state","stepMatchArguments":[{"group":{"start":18,"value":"\"Nueva Meta\"","children":[{"start":19,"value":"Nueva Meta","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]}]},
  {"pwTestLine":15,"pickleLine":24,"tags":["@savings","@summary","@visual"],"steps":[{"pwStepLine":16,"gherkinStepLine":25,"keywordType":"Context","textWithKeyword":"Given que el usuario de ahorros ha iniciado sesión","stepMatchArguments":[]},{"pwStepLine":17,"gherkinStepLine":26,"keywordType":"Context","textWithKeyword":"Given que tiene metas de ahorro activas y completadas","stepMatchArguments":[]},{"pwStepLine":18,"gherkinStepLine":27,"keywordType":"Action","textWithKeyword":"When navega a la página de ahorros","stepMatchArguments":[]},{"pwStepLine":19,"gherkinStepLine":28,"keywordType":"Outcome","textWithKeyword":"Then debe ver la tarjeta \"Total Ahorrado\"","stepMatchArguments":[{"group":{"start":20,"value":"\"Total Ahorrado\"","children":[{"start":21,"value":"Total Ahorrado","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":20,"gherkinStepLine":29,"keywordType":"Outcome","textWithKeyword":"Then debe ver la tarjeta \"Meta Total\"","stepMatchArguments":[{"group":{"start":20,"value":"\"Meta Total\"","children":[{"start":21,"value":"Meta Total","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":21,"gherkinStepLine":30,"keywordType":"Outcome","textWithKeyword":"Then debe ver la tarjeta \"Progreso General\"","stepMatchArguments":[{"group":{"start":20,"value":"\"Progreso General\"","children":[{"start":21,"value":"Progreso General","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":22,"gherkinStepLine":31,"keywordType":"Outcome","textWithKeyword":"Then debe ver la tarjeta \"Disponible para Gastar\"","stepMatchArguments":[{"group":{"start":20,"value":"\"Disponible para Gastar\"","children":[{"start":21,"value":"Disponible para Gastar","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]}]},
  {"pwTestLine":25,"pickleLine":38,"tags":["@savings","@spendable","@visual"],"steps":[{"pwStepLine":26,"gherkinStepLine":39,"keywordType":"Context","textWithKeyword":"Given que el usuario de ahorros ha iniciado sesión","stepMatchArguments":[]},{"pwStepLine":27,"gherkinStepLine":40,"keywordType":"Context","textWithKeyword":"Given que tiene metas de ahorro activas y completadas","stepMatchArguments":[]},{"pwStepLine":28,"gherkinStepLine":41,"keywordType":"Action","textWithKeyword":"When navega a la página de ahorros","stepMatchArguments":[]},{"pwStepLine":29,"gherkinStepLine":42,"keywordType":"Outcome","textWithKeyword":"Then debe ver la tarjeta \"Disponible para Gastar\" con desglose","stepMatchArguments":[{"group":{"start":20,"value":"\"Disponible para Gastar\"","children":[{"start":21,"value":"Disponible para Gastar","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":30,"gherkinStepLine":43,"keywordType":"Outcome","textWithKeyword":"Then debe ver la sección \"Ingresos\" en el desglose","stepMatchArguments":[{"group":{"start":20,"value":"\"Ingresos\"","children":[{"start":21,"value":"Ingresos","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":31,"gherkinStepLine":44,"keywordType":"Outcome","textWithKeyword":"Then debe ver la sección \"Gastos Fijos\" en el desglose","stepMatchArguments":[{"group":{"start":20,"value":"\"Gastos Fijos\"","children":[{"start":21,"value":"Gastos Fijos","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":32,"gherkinStepLine":45,"keywordType":"Outcome","textWithKeyword":"Then debe ver la sección \"Compromisos de Ahorro\" en el desglose","stepMatchArguments":[{"group":{"start":20,"value":"\"Compromisos de Ahorro\"","children":[{"start":21,"value":"Compromisos de Ahorro","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":33,"gherkinStepLine":46,"keywordType":"Outcome","textWithKeyword":"Then debe ver la sección \"Gastos Variables\" en el desglose","stepMatchArguments":[{"group":{"start":20,"value":"\"Gastos Variables\"","children":[{"start":21,"value":"Gastos Variables","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]}]},
]; // bdd-data-end