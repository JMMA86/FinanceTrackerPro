// Generated from: e2e\features\dashboard.feature
import { test } from "playwright-bdd";

test.describe('Dashboard financiero', () => {

  test('Dashboard carga con todas las secciones visibles después del login', { tag: ['@dashboard', '@visual', '@happy-path'] }, async ({ Given, Then, And, page }) => { 
    await Given('que el usuario del dashboard ha iniciado sesión', null, { page }); 
    await Then('debe ver el contenido principal del dashboard', null, { page }); 
    await And('debe ver la sección de Patrimonio con el label "Patrimonio"', null, { page }); 
    await And('debe ver las 4 tarjetas de métricas críticas', null, { page }); 
    await And('debe ver la sección de Liquidez expandible', null, { page }); 
    await And('debe ver la sección de Distribución Patrimonial', null, { page }); 
    await And('debe ver la sección de Transacciones Recientes', null, { page }); 
  });

  test('Dashboard en estado vacío muestra valores en cero y empty states', { tag: ['@dashboard', '@visual', '@empty-state'] }, async ({ Given, Then, And, page }) => { 
    await Given('que el usuario del dashboard ha iniciado sesión', null, { page }); 
    await Then('el valor de Patrimonio debe ser "$0"', null, { page }); 
    await And('las métricas críticas deben mostrar "$0"', null, { page }); 
    await And('la Distribución Patrimonial debe mostrar empty state "Sin datos"', null, { page }); 
    await And('las Transacciones Recientes deben mostrar empty state "Sin transacciones"', null, { page }); 
  });

  test('Hero card muestra net worth con label y estructura correcta', { tag: ['@dashboard', '@visual'] }, async ({ Given, Then, And, page }) => { 
    await Given('que el usuario del dashboard ha iniciado sesión', null, { page }); 
    await Then('el Hero card debe mostrar el label "Patrimonio"', null, { page }); 
    await And('debe mostrar el badge "Activo"', null, { page }); 
    await And('debe tener el botón de toggle de máscara', null, { page }); 
  });

  test('Las 4 tarjetas de métricas se muestran con sus iconos y labels', { tag: ['@dashboard', '@visual'] }, async ({ Given, Then, And, page }) => { 
    await Given('que el usuario del dashboard ha iniciado sesión', null, { page }); 
    await Then('debe ver el label "Efectivo Total" en las métricas', null, { page }); 
    await And('debe ver el label "Máximo Gastable" en las métricas', null, { page }); 
    await And('debe ver el label "Ahorros" en las métricas', null, { page }); 
    await And('debe ver el label "Deudas Totales" en las métricas', null, { page }); 
  });

  test('Distribución patrimonial muestra empty state sin datos', { tag: ['@dashboard', '@visual', '@empty-state'] }, async ({ Given, Then, And, page }) => { 
    await Given('que el usuario del dashboard ha iniciado sesión', null, { page }); 
    await Then('la Distribución Patrimonial debe mostrar empty state "Sin datos"', null, { page }); 
    await And('debe mostrar el mensaje "Agrega cuentas para ver distribución"', null, { page }); 
  });

  test('Transacciones recientes muestra empty state sin transacciones', { tag: ['@dashboard', '@visual', '@empty-state'] }, async ({ Given, Then, And, page }) => { 
    await Given('que el usuario del dashboard ha iniciado sesión', null, { page }); 
    await Then('las Transacciones Recientes deben mostrar empty state "Sin transacciones"', null, { page }); 
    await And('debe mostrar el mensaje "Comienza a registrar para verlas aquí"', null, { page }); 
    await And('debe mostrar el botón "Nueva Transacción" en el empty state', null, { page }); 
  });

  test('Toggle de enmascaramiento oculta los valores monetarios', { tag: ['@dashboard', '@interaction', '@mask'] }, async ({ Given, When, Then, page }) => { 
    await Given('que el usuario del dashboard ha iniciado sesión', null, { page }); 
    await Given('que ve el dashboard con valores visibles', null, { page }); 
    await When('hace clic en el botón de toggle de máscara', null, { page }); 
    await Then('los valores monetarios deben mostrar "***"', null, { page }); 
    await When('hace clic en el botón de toggle de máscara nuevamente', null, { page }); 
    await Then('los valores monetarios deben volver a mostrar valores numéricos', null, { page }); 
  });

  test('Sección expandible de Liquidez se puede expandir y colapsar', { tag: ['@dashboard', '@interaction', '@expandable'] }, async ({ Given, When, Then, page }) => { 
    await Given('que el usuario del dashboard ha iniciado sesión', null, { page }); 
    await Given('que la sección Liquidez comienza expandida', null, { page }); 
    await When('hace clic en el botón de sección "Liquidez"', null, { page }); 
    await Then('el contenido de Liquidez debe estar oculto', null, { page }); 
    await When('hace clic en el botón de sección "Liquidez" nuevamente', null, { page }); 
    await Then('el contenido de Liquidez debe estar visible', null, { page }); 
  });

  test('Link "Ver todas" navega a la página de transacciones', { tag: ['@dashboard', '@interaction', '@navigation'] }, async ({ Given, When, Then, page }) => { 
    await Given('que el usuario del dashboard ha iniciado sesión', null, { page }); 
    await When('hace clic en el enlace "Ver todas" de Transacciones Recientes', null, { page }); 
    await Then('debe ser redirigido a "/es/transactions"', null, { page }); 
  });

  test('Sidebar de navegación visible en desktop con enlaces principales', { tag: ['@dashboard', '@layout', '@desktop'] }, async ({ Given, Then, And, page }) => { 
    await Given('que el usuario del dashboard ha iniciado sesión', null, { page }); 
    await Given('que la pantalla es de escritorio', null, { page }); 
    await Then('el sidebar de navegación debe ser visible', null, { page }); 
    await And('el sidebar debe contener enlace a "Dashboard"', null, { page }); 
    await And('el sidebar debe contener enlace a "Transacciones"', null, { page }); 
    await And('el sidebar debe contener enlace a "Cuentas"', null, { page }); 
    await And('el sidebar debe contener botón de "Cerrar Sesión"', null, { page }); 
  });

  test('Bottom bar de navegación visible en mobile', { tag: ['@dashboard', '@layout', '@mobile'] }, async ({ Given, Then, And, page }) => { 
    await Given('que el usuario del dashboard ha iniciado sesión', null, { page }); 
    await Given('que la pantalla es de escritorio', null, { page }); 
    await And('que el usuario ha iniciado sesión', null, { page }); 
    await And('que la pantalla es móvil 390x844', null, { page }); 
    await Then('la barra inferior de navegación debe ser visible', null, { page }); 
    await And('la barra inferior debe contener enlace a "Dashboard"', null, { page }); 
    await And('la barra inferior debe contener enlace a "Cuentas"', null, { page }); 
  });

  test('Click en enlace "Cuentas" del sidebar navega a cuentas', { tag: ['@dashboard', '@layout', '@navigation'] }, async ({ Given, When, Then, page }) => { 
    await Given('que el usuario del dashboard ha iniciado sesión', null, { page }); 
    await Given('que la pantalla es de escritorio', null, { page }); 
    await When('hace clic en el enlace "Cuentas" del sidebar', null, { page }); 
    await Then('debe ser redirigido a "/es/accounts"', null, { page }); 
  });

  test('Dashboard marca Dashboard como activo en el sidebar', { tag: ['@dashboard', '@layout', '@desktop'] }, async ({ Given, Then, page }) => { 
    await Given('que el usuario del dashboard ha iniciado sesión', null, { page }); 
    await Then('el enlace "Dashboard" en el sidebar debe estar marcado como activo', null, { page }); 
  });

  test('Dashboard en inglés muestra textos en inglés', { tag: ['@dashboard', '@i18n'] }, async ({ Given, Then, And, page }) => { 
    await Given('que el usuario del dashboard ha iniciado sesión', null, { page }); 
    await Given('que la pantalla es de escritorio', null, { page }); 
    await And('que el usuario ha iniciado sesión en inglés', null, { page }); 
    await Then('debe ver el contenido principal del dashboard', null, { page }); 
    await And('debe ver el label "Net Worth" en el dashboard', null, { page }); 
    await And('debe ver el label "Total Cash" en las métricas', null, { page }); 
    await And('la Distribución Patrimonial debe mostrar empty state "No Data"', null, { page }); 
    await And('las Transacciones Recientes deben mostrar empty state "No Transactions"', null, { page }); 
  });

  test('Skeleton loading se muestra durante la carga inicial', { tag: ['@dashboard', '@loading', '@skeleton'] }, async ({ Given, When, Then, And, page }) => { 
    await Given('que el usuario del dashboard ha iniciado sesión', null, { page }); 
    await When('navega al dashboard', null, { page }); 
    await Then('el skeleton de carga debe mostrarse inicialmente', null, { page }); 
    await And('eventualmente debe reemplazarse con el contenido real', null, { page }); 
  });

});

// == technical section ==

test.use({
  $test: [({}, use) => use(test), { scope: 'test', box: true }],
  $uri: [({}, use) => use('e2e\\features\\dashboard.feature'), { scope: 'test', box: true }],
  $bddFileData: [({}, use) => use(bddFileData), { scope: "test", box: true }],
});

const bddFileData = [ // bdd-data-start
  {"pwTestLine":6,"pickleLine":11,"tags":["@dashboard","@visual","@happy-path"],"steps":[{"pwStepLine":7,"gherkinStepLine":12,"keywordType":"Context","textWithKeyword":"Given que el usuario del dashboard ha iniciado sesión","stepMatchArguments":[]},{"pwStepLine":8,"gherkinStepLine":13,"keywordType":"Outcome","textWithKeyword":"Then debe ver el contenido principal del dashboard","stepMatchArguments":[]},{"pwStepLine":9,"gherkinStepLine":14,"keywordType":"Outcome","textWithKeyword":"And debe ver la sección de Patrimonio con el label \"Patrimonio\"","stepMatchArguments":[{"group":{"start":47,"value":"\"Patrimonio\"","children":[{"start":48,"value":"Patrimonio","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":10,"gherkinStepLine":15,"keywordType":"Outcome","textWithKeyword":"And debe ver las 4 tarjetas de métricas críticas","stepMatchArguments":[]},{"pwStepLine":11,"gherkinStepLine":16,"keywordType":"Outcome","textWithKeyword":"And debe ver la sección de Liquidez expandible","stepMatchArguments":[]},{"pwStepLine":12,"gherkinStepLine":17,"keywordType":"Outcome","textWithKeyword":"And debe ver la sección de Distribución Patrimonial","stepMatchArguments":[]},{"pwStepLine":13,"gherkinStepLine":18,"keywordType":"Outcome","textWithKeyword":"And debe ver la sección de Transacciones Recientes","stepMatchArguments":[]}]},
  {"pwTestLine":16,"pickleLine":21,"tags":["@dashboard","@visual","@empty-state"],"steps":[{"pwStepLine":17,"gherkinStepLine":22,"keywordType":"Context","textWithKeyword":"Given que el usuario del dashboard ha iniciado sesión","stepMatchArguments":[]},{"pwStepLine":18,"gherkinStepLine":23,"keywordType":"Outcome","textWithKeyword":"Then el valor de Patrimonio debe ser \"$0\"","stepMatchArguments":[{"group":{"start":32,"value":"\"$0\"","children":[{"start":33,"value":"$0","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":19,"gherkinStepLine":24,"keywordType":"Outcome","textWithKeyword":"And las métricas críticas deben mostrar \"$0\"","stepMatchArguments":[{"group":{"start":36,"value":"\"$0\"","children":[{"start":37,"value":"$0","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":20,"gherkinStepLine":25,"keywordType":"Outcome","textWithKeyword":"And la Distribución Patrimonial debe mostrar empty state \"Sin datos\"","stepMatchArguments":[{"group":{"start":53,"value":"\"Sin datos\"","children":[{"start":54,"value":"Sin datos","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":21,"gherkinStepLine":26,"keywordType":"Outcome","textWithKeyword":"And las Transacciones Recientes deben mostrar empty state \"Sin transacciones\"","stepMatchArguments":[{"group":{"start":54,"value":"\"Sin transacciones\"","children":[{"start":55,"value":"Sin transacciones","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]}]},
  {"pwTestLine":24,"pickleLine":29,"tags":["@dashboard","@visual"],"steps":[{"pwStepLine":25,"gherkinStepLine":30,"keywordType":"Context","textWithKeyword":"Given que el usuario del dashboard ha iniciado sesión","stepMatchArguments":[]},{"pwStepLine":26,"gherkinStepLine":31,"keywordType":"Outcome","textWithKeyword":"Then el Hero card debe mostrar el label \"Patrimonio\"","stepMatchArguments":[{"group":{"start":35,"value":"\"Patrimonio\"","children":[{"start":36,"value":"Patrimonio","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":27,"gherkinStepLine":32,"keywordType":"Outcome","textWithKeyword":"And debe mostrar el badge \"Activo\"","stepMatchArguments":[{"group":{"start":22,"value":"\"Activo\"","children":[{"start":23,"value":"Activo","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":28,"gherkinStepLine":33,"keywordType":"Outcome","textWithKeyword":"And debe tener el botón de toggle de máscara","stepMatchArguments":[]}]},
  {"pwTestLine":31,"pickleLine":36,"tags":["@dashboard","@visual"],"steps":[{"pwStepLine":32,"gherkinStepLine":37,"keywordType":"Context","textWithKeyword":"Given que el usuario del dashboard ha iniciado sesión","stepMatchArguments":[]},{"pwStepLine":33,"gherkinStepLine":38,"keywordType":"Outcome","textWithKeyword":"Then debe ver el label \"Efectivo Total\" en las métricas","stepMatchArguments":[{"group":{"start":18,"value":"\"Efectivo Total\"","children":[{"start":19,"value":"Efectivo Total","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":34,"gherkinStepLine":39,"keywordType":"Outcome","textWithKeyword":"And debe ver el label \"Máximo Gastable\" en las métricas","stepMatchArguments":[{"group":{"start":18,"value":"\"Máximo Gastable\"","children":[{"start":19,"value":"Máximo Gastable","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":35,"gherkinStepLine":40,"keywordType":"Outcome","textWithKeyword":"And debe ver el label \"Ahorros\" en las métricas","stepMatchArguments":[{"group":{"start":18,"value":"\"Ahorros\"","children":[{"start":19,"value":"Ahorros","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":36,"gherkinStepLine":41,"keywordType":"Outcome","textWithKeyword":"And debe ver el label \"Deudas Totales\" en las métricas","stepMatchArguments":[{"group":{"start":18,"value":"\"Deudas Totales\"","children":[{"start":19,"value":"Deudas Totales","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]}]},
  {"pwTestLine":39,"pickleLine":44,"tags":["@dashboard","@visual","@empty-state"],"steps":[{"pwStepLine":40,"gherkinStepLine":45,"keywordType":"Context","textWithKeyword":"Given que el usuario del dashboard ha iniciado sesión","stepMatchArguments":[]},{"pwStepLine":41,"gherkinStepLine":46,"keywordType":"Outcome","textWithKeyword":"Then la Distribución Patrimonial debe mostrar empty state \"Sin datos\"","stepMatchArguments":[{"group":{"start":53,"value":"\"Sin datos\"","children":[{"start":54,"value":"Sin datos","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":42,"gherkinStepLine":47,"keywordType":"Outcome","textWithKeyword":"And debe mostrar el mensaje \"Agrega cuentas para ver distribución\"","stepMatchArguments":[{"group":{"start":24,"value":"\"Agrega cuentas para ver distribución\"","children":[{"start":25,"value":"Agrega cuentas para ver distribución","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]}]},
  {"pwTestLine":45,"pickleLine":50,"tags":["@dashboard","@visual","@empty-state"],"steps":[{"pwStepLine":46,"gherkinStepLine":51,"keywordType":"Context","textWithKeyword":"Given que el usuario del dashboard ha iniciado sesión","stepMatchArguments":[]},{"pwStepLine":47,"gherkinStepLine":52,"keywordType":"Outcome","textWithKeyword":"Then las Transacciones Recientes deben mostrar empty state \"Sin transacciones\"","stepMatchArguments":[{"group":{"start":54,"value":"\"Sin transacciones\"","children":[{"start":55,"value":"Sin transacciones","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":48,"gherkinStepLine":53,"keywordType":"Outcome","textWithKeyword":"And debe mostrar el mensaje \"Comienza a registrar para verlas aquí\"","stepMatchArguments":[{"group":{"start":24,"value":"\"Comienza a registrar para verlas aquí\"","children":[{"start":25,"value":"Comienza a registrar para verlas aquí","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":49,"gherkinStepLine":54,"keywordType":"Outcome","textWithKeyword":"And debe mostrar el botón \"Nueva Transacción\" en el empty state","stepMatchArguments":[{"group":{"start":22,"value":"\"Nueva Transacción\"","children":[{"start":23,"value":"Nueva Transacción","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]}]},
  {"pwTestLine":52,"pickleLine":61,"tags":["@dashboard","@interaction","@mask"],"steps":[{"pwStepLine":53,"gherkinStepLine":62,"keywordType":"Context","textWithKeyword":"Given que el usuario del dashboard ha iniciado sesión","stepMatchArguments":[]},{"pwStepLine":54,"gherkinStepLine":63,"keywordType":"Context","textWithKeyword":"Given que ve el dashboard con valores visibles","stepMatchArguments":[]},{"pwStepLine":55,"gherkinStepLine":64,"keywordType":"Action","textWithKeyword":"When hace clic en el botón de toggle de máscara","stepMatchArguments":[]},{"pwStepLine":56,"gherkinStepLine":65,"keywordType":"Outcome","textWithKeyword":"Then los valores monetarios deben mostrar \"***\"","stepMatchArguments":[{"group":{"start":37,"value":"\"***\"","children":[{"start":38,"value":"***","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":57,"gherkinStepLine":66,"keywordType":"Action","textWithKeyword":"When hace clic en el botón de toggle de máscara nuevamente","stepMatchArguments":[]},{"pwStepLine":58,"gherkinStepLine":67,"keywordType":"Outcome","textWithKeyword":"Then los valores monetarios deben volver a mostrar valores numéricos","stepMatchArguments":[]}]},
  {"pwTestLine":61,"pickleLine":70,"tags":["@dashboard","@interaction","@expandable"],"steps":[{"pwStepLine":62,"gherkinStepLine":71,"keywordType":"Context","textWithKeyword":"Given que el usuario del dashboard ha iniciado sesión","stepMatchArguments":[]},{"pwStepLine":63,"gherkinStepLine":72,"keywordType":"Context","textWithKeyword":"Given que la sección Liquidez comienza expandida","stepMatchArguments":[]},{"pwStepLine":64,"gherkinStepLine":73,"keywordType":"Action","textWithKeyword":"When hace clic en el botón de sección \"Liquidez\"","stepMatchArguments":[{"group":{"start":33,"value":"\"Liquidez\"","children":[{"start":34,"value":"Liquidez","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":65,"gherkinStepLine":74,"keywordType":"Outcome","textWithKeyword":"Then el contenido de Liquidez debe estar oculto","stepMatchArguments":[]},{"pwStepLine":66,"gherkinStepLine":75,"keywordType":"Action","textWithKeyword":"When hace clic en el botón de sección \"Liquidez\" nuevamente","stepMatchArguments":[{"group":{"start":33,"value":"\"Liquidez\"","children":[{"start":34,"value":"Liquidez","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":67,"gherkinStepLine":76,"keywordType":"Outcome","textWithKeyword":"Then el contenido de Liquidez debe estar visible","stepMatchArguments":[]}]},
  {"pwTestLine":70,"pickleLine":79,"tags":["@dashboard","@interaction","@navigation"],"steps":[{"pwStepLine":71,"gherkinStepLine":80,"keywordType":"Context","textWithKeyword":"Given que el usuario del dashboard ha iniciado sesión","stepMatchArguments":[]},{"pwStepLine":72,"gherkinStepLine":81,"keywordType":"Action","textWithKeyword":"When hace clic en el enlace \"Ver todas\" de Transacciones Recientes","stepMatchArguments":[{"group":{"start":23,"value":"\"Ver todas\"","children":[{"start":24,"value":"Ver todas","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":73,"gherkinStepLine":82,"keywordType":"Outcome","textWithKeyword":"Then debe ser redirigido a \"/es/transactions\"","stepMatchArguments":[{"group":{"start":22,"value":"\"/es/transactions\"","children":[{"start":23,"value":"/es/transactions","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]}]},
  {"pwTestLine":76,"pickleLine":89,"tags":["@dashboard","@layout","@desktop"],"steps":[{"pwStepLine":77,"gherkinStepLine":90,"keywordType":"Context","textWithKeyword":"Given que el usuario del dashboard ha iniciado sesión","stepMatchArguments":[]},{"pwStepLine":78,"gherkinStepLine":91,"keywordType":"Context","textWithKeyword":"Given que la pantalla es de escritorio","stepMatchArguments":[]},{"pwStepLine":79,"gherkinStepLine":92,"keywordType":"Outcome","textWithKeyword":"Then el sidebar de navegación debe ser visible","stepMatchArguments":[]},{"pwStepLine":80,"gherkinStepLine":93,"keywordType":"Outcome","textWithKeyword":"And el sidebar debe contener enlace a \"Dashboard\"","stepMatchArguments":[{"group":{"start":34,"value":"\"Dashboard\"","children":[{"start":35,"value":"Dashboard","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":81,"gherkinStepLine":94,"keywordType":"Outcome","textWithKeyword":"And el sidebar debe contener enlace a \"Transacciones\"","stepMatchArguments":[{"group":{"start":34,"value":"\"Transacciones\"","children":[{"start":35,"value":"Transacciones","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":82,"gherkinStepLine":95,"keywordType":"Outcome","textWithKeyword":"And el sidebar debe contener enlace a \"Cuentas\"","stepMatchArguments":[{"group":{"start":34,"value":"\"Cuentas\"","children":[{"start":35,"value":"Cuentas","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":83,"gherkinStepLine":96,"keywordType":"Outcome","textWithKeyword":"And el sidebar debe contener botón de \"Cerrar Sesión\"","stepMatchArguments":[{"group":{"start":34,"value":"\"Cerrar Sesión\"","children":[{"start":35,"value":"Cerrar Sesión","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]}]},
  {"pwTestLine":86,"pickleLine":99,"tags":["@dashboard","@layout","@mobile"],"steps":[{"pwStepLine":87,"gherkinStepLine":100,"keywordType":"Context","textWithKeyword":"Given que el usuario del dashboard ha iniciado sesión","stepMatchArguments":[]},{"pwStepLine":88,"gherkinStepLine":101,"keywordType":"Context","textWithKeyword":"Given que la pantalla es de escritorio","stepMatchArguments":[]},{"pwStepLine":89,"gherkinStepLine":102,"keywordType":"Context","textWithKeyword":"And que el usuario ha iniciado sesión","stepMatchArguments":[]},{"pwStepLine":90,"gherkinStepLine":103,"keywordType":"Context","textWithKeyword":"And que la pantalla es móvil 390x844","stepMatchArguments":[{"group":{"start":25,"value":"390","children":[]},"parameterTypeName":"int"},{"group":{"start":29,"value":"844","children":[]},"parameterTypeName":"int"}]},{"pwStepLine":91,"gherkinStepLine":104,"keywordType":"Outcome","textWithKeyword":"Then la barra inferior de navegación debe ser visible","stepMatchArguments":[]},{"pwStepLine":92,"gherkinStepLine":105,"keywordType":"Outcome","textWithKeyword":"And la barra inferior debe contener enlace a \"Dashboard\"","stepMatchArguments":[{"group":{"start":41,"value":"\"Dashboard\"","children":[{"start":42,"value":"Dashboard","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":93,"gherkinStepLine":106,"keywordType":"Outcome","textWithKeyword":"And la barra inferior debe contener enlace a \"Cuentas\"","stepMatchArguments":[{"group":{"start":41,"value":"\"Cuentas\"","children":[{"start":42,"value":"Cuentas","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]}]},
  {"pwTestLine":96,"pickleLine":109,"tags":["@dashboard","@layout","@navigation"],"steps":[{"pwStepLine":97,"gherkinStepLine":110,"keywordType":"Context","textWithKeyword":"Given que el usuario del dashboard ha iniciado sesión","stepMatchArguments":[]},{"pwStepLine":98,"gherkinStepLine":111,"keywordType":"Context","textWithKeyword":"Given que la pantalla es de escritorio","stepMatchArguments":[]},{"pwStepLine":99,"gherkinStepLine":112,"keywordType":"Action","textWithKeyword":"When hace clic en el enlace \"Cuentas\" del sidebar","stepMatchArguments":[{"group":{"start":23,"value":"\"Cuentas\"","children":[{"start":24,"value":"Cuentas","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":100,"gherkinStepLine":113,"keywordType":"Outcome","textWithKeyword":"Then debe ser redirigido a \"/es/accounts\"","stepMatchArguments":[{"group":{"start":22,"value":"\"/es/accounts\"","children":[{"start":23,"value":"/es/accounts","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]}]},
  {"pwTestLine":103,"pickleLine":116,"tags":["@dashboard","@layout","@desktop"],"steps":[{"pwStepLine":104,"gherkinStepLine":117,"keywordType":"Context","textWithKeyword":"Given que el usuario del dashboard ha iniciado sesión","stepMatchArguments":[]},{"pwStepLine":105,"gherkinStepLine":118,"keywordType":"Outcome","textWithKeyword":"Then el enlace \"Dashboard\" en el sidebar debe estar marcado como activo","stepMatchArguments":[{"group":{"start":10,"value":"\"Dashboard\"","children":[{"start":11,"value":"Dashboard","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]}]},
  {"pwTestLine":108,"pickleLine":125,"tags":["@dashboard","@i18n"],"steps":[{"pwStepLine":109,"gherkinStepLine":126,"keywordType":"Context","textWithKeyword":"Given que el usuario del dashboard ha iniciado sesión","stepMatchArguments":[]},{"pwStepLine":110,"gherkinStepLine":127,"keywordType":"Context","textWithKeyword":"Given que la pantalla es de escritorio","stepMatchArguments":[]},{"pwStepLine":111,"gherkinStepLine":128,"keywordType":"Context","textWithKeyword":"And que el usuario ha iniciado sesión en inglés","stepMatchArguments":[]},{"pwStepLine":112,"gherkinStepLine":129,"keywordType":"Outcome","textWithKeyword":"Then debe ver el contenido principal del dashboard","stepMatchArguments":[]},{"pwStepLine":113,"gherkinStepLine":130,"keywordType":"Outcome","textWithKeyword":"And debe ver el label \"Net Worth\" en el dashboard","stepMatchArguments":[{"group":{"start":18,"value":"\"Net Worth\"","children":[{"start":19,"value":"Net Worth","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":114,"gherkinStepLine":131,"keywordType":"Outcome","textWithKeyword":"And debe ver el label \"Total Cash\" en las métricas","stepMatchArguments":[{"group":{"start":18,"value":"\"Total Cash\"","children":[{"start":19,"value":"Total Cash","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":115,"gherkinStepLine":132,"keywordType":"Outcome","textWithKeyword":"And la Distribución Patrimonial debe mostrar empty state \"No Data\"","stepMatchArguments":[{"group":{"start":53,"value":"\"No Data\"","children":[{"start":54,"value":"No Data","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":116,"gherkinStepLine":133,"keywordType":"Outcome","textWithKeyword":"And las Transacciones Recientes deben mostrar empty state \"No Transactions\"","stepMatchArguments":[{"group":{"start":54,"value":"\"No Transactions\"","children":[{"start":55,"value":"No Transactions","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]}]},
  {"pwTestLine":119,"pickleLine":140,"tags":["@dashboard","@loading","@skeleton"],"steps":[{"pwStepLine":120,"gherkinStepLine":141,"keywordType":"Context","textWithKeyword":"Given que el usuario del dashboard ha iniciado sesión","stepMatchArguments":[]},{"pwStepLine":121,"gherkinStepLine":142,"keywordType":"Action","textWithKeyword":"When navega al dashboard","stepMatchArguments":[]},{"pwStepLine":122,"gherkinStepLine":143,"keywordType":"Outcome","textWithKeyword":"Then el skeleton de carga debe mostrarse inicialmente","stepMatchArguments":[]},{"pwStepLine":123,"gherkinStepLine":144,"keywordType":"Outcome","textWithKeyword":"And eventualmente debe reemplazarse con el contenido real","stepMatchArguments":[]}]},
]; // bdd-data-end