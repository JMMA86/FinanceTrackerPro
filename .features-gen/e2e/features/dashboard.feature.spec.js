// Generated from: e2e\features\dashboard.feature
import { test } from "playwright-bdd";

test.describe('Dashboard financiero', () => {

  test.beforeEach('Background', async ({ Given, page }, testInfo) => { if (testInfo.error) return;
    await Given('que el usuario ha iniciado sesión', null, { page }); 
  });
  
  test('Dashboard carga con todas las secciones visibles después del login', { tag: ['@dashboard', '@visual', '@happy-path'] }, async ({ Then, And, page }) => { 
    await Then('debe ver el contenido principal del dashboard', null, { page }); 
    await And('debe ver la sección de Patrimonio con el label "Patrimonio"', null, { page }); 
    await And('debe ver las 4 tarjetas de métricas críticas', null, { page }); 
    await And('debe ver la sección de Liquidez expandible', null, { page }); 
    await And('debe ver la sección de Distribución Patrimonial', null, { page }); 
    await And('debe ver la sección de Transacciones Recientes', null, { page }); 
  });

  test('Dashboard en estado vacío muestra valores en cero y empty states', { tag: ['@dashboard', '@visual', '@empty-state'] }, async ({ Then, And, page }) => { 
    await Then('el valor de Patrimonio debe ser "$0"', null, { page }); 
    await And('las métricas críticas deben mostrar "$0"', null, { page }); 
    await And('la Distribución Patrimonial debe mostrar empty state "Sin datos"', null, { page }); 
    await And('las Transacciones Recientes deben mostrar empty state "Sin transacciones"', null, { page }); 
  });

  test('Hero card muestra net worth con label y estructura correcta', { tag: ['@dashboard', '@visual'] }, async ({ Then, And, page }) => { 
    await Then('el Hero card debe mostrar el label "Patrimonio"', null, { page }); 
    await And('debe mostrar el badge "Activo"', null, { page }); 
    await And('debe tener el botón de toggle de máscara', null, { page }); 
  });

  test('Las 4 tarjetas de métricas se muestran con sus iconos y labels', { tag: ['@dashboard', '@visual'] }, async ({ Then, And, page }) => { 
    await Then('debe ver el label "Efectivo Total" en las métricas', null, { page }); 
    await And('debe ver el label "Máximo Gastable" en las métricas', null, { page }); 
    await And('debe ver el label "Ahorros" en las métricas', null, { page }); 
    await And('debe ver el label "Deudas Totales" en las métricas', null, { page }); 
  });

  test('Distribución patrimonial muestra empty state sin datos', { tag: ['@dashboard', '@visual', '@empty-state'] }, async ({ Then, And, page }) => { 
    await Then('la Distribución Patrimonial debe mostrar empty state "Sin datos"', null, { page }); 
    await And('debe mostrar el mensaje "Agrega cuentas para ver distribución"', null, { page }); 
  });

  test('Transacciones recientes muestra empty state sin transacciones', { tag: ['@dashboard', '@visual', '@empty-state'] }, async ({ Then, And, page }) => { 
    await Then('las Transacciones Recientes deben mostrar empty state "Sin transacciones"', null, { page }); 
    await And('debe mostrar el mensaje "Comienza a registrar para verlas aquí"', null, { page }); 
    await And('debe mostrar el botón "Nueva Transacción" en el empty state', null, { page }); 
  });

  test('Toggle de enmascaramiento oculta los valores monetarios', { tag: ['@dashboard', '@interaction', '@mask'] }, async ({ Given, When, Then, page }) => { 
    await Given('que ve el dashboard con valores visibles', null, { page }); 
    await When('hace clic en el botón de toggle de máscara', null, { page }); 
    await Then('los valores monetarios deben mostrar "***"', null, { page }); 
    await When('hace clic en el botón de toggle de máscara nuevamente', null, { page }); 
    await Then('los valores monetarios deben volver a mostrar valores numéricos', null, { page }); 
  });

  test('Sección expandible de Liquidez se puede expandir y colapsar', { tag: ['@dashboard', '@interaction', '@expandable'] }, async ({ Given, When, Then, page }) => { 
    await Given('que la sección Liquidez comienza expandida', null, { page }); 
    await When('hace clic en el botón de sección "Liquidez"', null, { page }); 
    await Then('el contenido de Liquidez debe estar oculto', null, { page }); 
    await When('hace clic en el botón de sección "Liquidez" nuevamente', null, { page }); 
    await Then('el contenido de Liquidez debe estar visible', null, { page }); 
  });

  test('Link "Ver todas" navega a la página de transacciones', { tag: ['@dashboard', '@interaction', '@navigation'] }, async ({ When, Then, page }) => { 
    await When('hace clic en el enlace "Ver todas" de Transacciones Recientes', null, { page }); 
    await Then('debe ser redirigido a "/es/transactions"', null, { page }); 
  });

  test('Sidebar de navegación visible en desktop con enlaces principales', { tag: ['@dashboard', '@layout', '@desktop'] }, async ({ Given, Then, And, page }) => { 
    await Given('que la pantalla es de escritorio', null, { page }); 
    await Then('el sidebar de navegación debe ser visible', null, { page }); 
    await And('el sidebar debe contener enlace a "Dashboard"', null, { page }); 
    await And('el sidebar debe contener enlace a "Transacciones"', null, { page }); 
    await And('el sidebar debe contener enlace a "Cuentas"', null, { page }); 
    await And('el sidebar debe contener botón de "Cerrar Sesión"', null, { page }); 
  });

  test('Bottom bar de navegación visible en mobile', { tag: ['@dashboard', '@layout', '@mobile'] }, async ({ Given, Then, And, page }) => { 
    await Given('que la pantalla es de escritorio', null, { page }); 
    await And('que el usuario ha iniciado sesión', null, { page }); 
    await And('que la pantalla es móvil 390x844', null, { page }); 
    await Then('la barra inferior de navegación debe ser visible', null, { page }); 
    await And('la barra inferior debe contener enlace a "Dashboard"', null, { page }); 
    await And('la barra inferior debe contener enlace a "Cuentas"', null, { page }); 
  });

  test('Click en enlace "Cuentas" del sidebar navega a cuentas', { tag: ['@dashboard', '@layout', '@navigation'] }, async ({ Given, When, Then, page }) => { 
    await Given('que la pantalla es de escritorio', null, { page }); 
    await When('hace clic en el enlace "Cuentas" del sidebar', null, { page }); 
    await Then('debe ser redirigido a "/es/accounts"', null, { page }); 
  });

  test('Dashboard marca Dashboard como activo en el sidebar', { tag: ['@dashboard', '@layout', '@desktop'] }, async ({ Then, page }) => { 
    await Then('el enlace "Dashboard" en el sidebar debe estar marcado como activo', null, { page }); 
  });

  test('Dashboard en inglés muestra textos en inglés', { tag: ['@dashboard', '@i18n'] }, async ({ Given, Then, And, page }) => { 
    await Given('que la pantalla es de escritorio', null, { page }); 
    await And('que el usuario ha iniciado sesión en inglés', null, { page }); 
    await Then('debe ver el contenido principal del dashboard', null, { page }); 
    await And('debe ver el label "Net Worth" en el dashboard', null, { page }); 
    await And('debe ver el label "Total Cash" en las métricas', null, { page }); 
    await And('la Distribución Patrimonial debe mostrar empty state "No Data"', null, { page }); 
    await And('las Transacciones Recientes deben mostrar empty state "No Transactions"', null, { page }); 
  });

  test('Skeleton loading se muestra durante la carga inicial', { tag: ['@dashboard', '@loading', '@skeleton'] }, async ({ When, Then, And, page }) => { 
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
  {"pwTestLine":10,"pickleLine":14,"tags":["@dashboard","@visual","@happy-path"],"steps":[{"pwStepLine":7,"gherkinStepLine":7,"keywordType":"Context","textWithKeyword":"Given que el usuario ha iniciado sesión","isBg":true,"stepMatchArguments":[]},{"pwStepLine":11,"gherkinStepLine":15,"keywordType":"Outcome","textWithKeyword":"Then debe ver el contenido principal del dashboard","stepMatchArguments":[]},{"pwStepLine":12,"gherkinStepLine":16,"keywordType":"Outcome","textWithKeyword":"And debe ver la sección de Patrimonio con el label \"Patrimonio\"","stepMatchArguments":[{"group":{"start":47,"value":"\"Patrimonio\"","children":[{"start":48,"value":"Patrimonio","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":13,"gherkinStepLine":17,"keywordType":"Outcome","textWithKeyword":"And debe ver las 4 tarjetas de métricas críticas","stepMatchArguments":[]},{"pwStepLine":14,"gherkinStepLine":18,"keywordType":"Outcome","textWithKeyword":"And debe ver la sección de Liquidez expandible","stepMatchArguments":[]},{"pwStepLine":15,"gherkinStepLine":19,"keywordType":"Outcome","textWithKeyword":"And debe ver la sección de Distribución Patrimonial","stepMatchArguments":[]},{"pwStepLine":16,"gherkinStepLine":20,"keywordType":"Outcome","textWithKeyword":"And debe ver la sección de Transacciones Recientes","stepMatchArguments":[]}]},
  {"pwTestLine":19,"pickleLine":23,"tags":["@dashboard","@visual","@empty-state"],"steps":[{"pwStepLine":7,"gherkinStepLine":7,"keywordType":"Context","textWithKeyword":"Given que el usuario ha iniciado sesión","isBg":true,"stepMatchArguments":[]},{"pwStepLine":20,"gherkinStepLine":24,"keywordType":"Outcome","textWithKeyword":"Then el valor de Patrimonio debe ser \"$0\"","stepMatchArguments":[{"group":{"start":32,"value":"\"$0\"","children":[{"start":33,"value":"$0","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":21,"gherkinStepLine":25,"keywordType":"Outcome","textWithKeyword":"And las métricas críticas deben mostrar \"$0\"","stepMatchArguments":[{"group":{"start":36,"value":"\"$0\"","children":[{"start":37,"value":"$0","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":22,"gherkinStepLine":26,"keywordType":"Outcome","textWithKeyword":"And la Distribución Patrimonial debe mostrar empty state \"Sin datos\"","stepMatchArguments":[{"group":{"start":53,"value":"\"Sin datos\"","children":[{"start":54,"value":"Sin datos","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":23,"gherkinStepLine":27,"keywordType":"Outcome","textWithKeyword":"And las Transacciones Recientes deben mostrar empty state \"Sin transacciones\"","stepMatchArguments":[{"group":{"start":54,"value":"\"Sin transacciones\"","children":[{"start":55,"value":"Sin transacciones","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]}]},
  {"pwTestLine":26,"pickleLine":30,"tags":["@dashboard","@visual"],"steps":[{"pwStepLine":7,"gherkinStepLine":7,"keywordType":"Context","textWithKeyword":"Given que el usuario ha iniciado sesión","isBg":true,"stepMatchArguments":[]},{"pwStepLine":27,"gherkinStepLine":31,"keywordType":"Outcome","textWithKeyword":"Then el Hero card debe mostrar el label \"Patrimonio\"","stepMatchArguments":[{"group":{"start":35,"value":"\"Patrimonio\"","children":[{"start":36,"value":"Patrimonio","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":28,"gherkinStepLine":32,"keywordType":"Outcome","textWithKeyword":"And debe mostrar el badge \"Activo\"","stepMatchArguments":[{"group":{"start":22,"value":"\"Activo\"","children":[{"start":23,"value":"Activo","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":29,"gherkinStepLine":33,"keywordType":"Outcome","textWithKeyword":"And debe tener el botón de toggle de máscara","stepMatchArguments":[]}]},
  {"pwTestLine":32,"pickleLine":36,"tags":["@dashboard","@visual"],"steps":[{"pwStepLine":7,"gherkinStepLine":7,"keywordType":"Context","textWithKeyword":"Given que el usuario ha iniciado sesión","isBg":true,"stepMatchArguments":[]},{"pwStepLine":33,"gherkinStepLine":37,"keywordType":"Outcome","textWithKeyword":"Then debe ver el label \"Efectivo Total\" en las métricas","stepMatchArguments":[{"group":{"start":18,"value":"\"Efectivo Total\"","children":[{"start":19,"value":"Efectivo Total","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":34,"gherkinStepLine":38,"keywordType":"Outcome","textWithKeyword":"And debe ver el label \"Máximo Gastable\" en las métricas","stepMatchArguments":[{"group":{"start":18,"value":"\"Máximo Gastable\"","children":[{"start":19,"value":"Máximo Gastable","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":35,"gherkinStepLine":39,"keywordType":"Outcome","textWithKeyword":"And debe ver el label \"Ahorros\" en las métricas","stepMatchArguments":[{"group":{"start":18,"value":"\"Ahorros\"","children":[{"start":19,"value":"Ahorros","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":36,"gherkinStepLine":40,"keywordType":"Outcome","textWithKeyword":"And debe ver el label \"Deudas Totales\" en las métricas","stepMatchArguments":[{"group":{"start":18,"value":"\"Deudas Totales\"","children":[{"start":19,"value":"Deudas Totales","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]}]},
  {"pwTestLine":39,"pickleLine":43,"tags":["@dashboard","@visual","@empty-state"],"steps":[{"pwStepLine":7,"gherkinStepLine":7,"keywordType":"Context","textWithKeyword":"Given que el usuario ha iniciado sesión","isBg":true,"stepMatchArguments":[]},{"pwStepLine":40,"gherkinStepLine":44,"keywordType":"Outcome","textWithKeyword":"Then la Distribución Patrimonial debe mostrar empty state \"Sin datos\"","stepMatchArguments":[{"group":{"start":53,"value":"\"Sin datos\"","children":[{"start":54,"value":"Sin datos","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":41,"gherkinStepLine":45,"keywordType":"Outcome","textWithKeyword":"And debe mostrar el mensaje \"Agrega cuentas para ver distribución\"","stepMatchArguments":[{"group":{"start":24,"value":"\"Agrega cuentas para ver distribución\"","children":[{"start":25,"value":"Agrega cuentas para ver distribución","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]}]},
  {"pwTestLine":44,"pickleLine":48,"tags":["@dashboard","@visual","@empty-state"],"steps":[{"pwStepLine":7,"gherkinStepLine":7,"keywordType":"Context","textWithKeyword":"Given que el usuario ha iniciado sesión","isBg":true,"stepMatchArguments":[]},{"pwStepLine":45,"gherkinStepLine":49,"keywordType":"Outcome","textWithKeyword":"Then las Transacciones Recientes deben mostrar empty state \"Sin transacciones\"","stepMatchArguments":[{"group":{"start":54,"value":"\"Sin transacciones\"","children":[{"start":55,"value":"Sin transacciones","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":46,"gherkinStepLine":50,"keywordType":"Outcome","textWithKeyword":"And debe mostrar el mensaje \"Comienza a registrar para verlas aquí\"","stepMatchArguments":[{"group":{"start":24,"value":"\"Comienza a registrar para verlas aquí\"","children":[{"start":25,"value":"Comienza a registrar para verlas aquí","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":47,"gherkinStepLine":51,"keywordType":"Outcome","textWithKeyword":"And debe mostrar el botón \"Nueva Transacción\" en el empty state","stepMatchArguments":[{"group":{"start":22,"value":"\"Nueva Transacción\"","children":[{"start":23,"value":"Nueva Transacción","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]}]},
  {"pwTestLine":50,"pickleLine":58,"tags":["@dashboard","@interaction","@mask"],"steps":[{"pwStepLine":7,"gherkinStepLine":7,"keywordType":"Context","textWithKeyword":"Given que el usuario ha iniciado sesión","isBg":true,"stepMatchArguments":[]},{"pwStepLine":51,"gherkinStepLine":59,"keywordType":"Context","textWithKeyword":"Given que ve el dashboard con valores visibles","stepMatchArguments":[]},{"pwStepLine":52,"gherkinStepLine":60,"keywordType":"Action","textWithKeyword":"When hace clic en el botón de toggle de máscara","stepMatchArguments":[]},{"pwStepLine":53,"gherkinStepLine":61,"keywordType":"Outcome","textWithKeyword":"Then los valores monetarios deben mostrar \"***\"","stepMatchArguments":[{"group":{"start":37,"value":"\"***\"","children":[{"start":38,"value":"***","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":54,"gherkinStepLine":62,"keywordType":"Action","textWithKeyword":"When hace clic en el botón de toggle de máscara nuevamente","stepMatchArguments":[]},{"pwStepLine":55,"gherkinStepLine":63,"keywordType":"Outcome","textWithKeyword":"Then los valores monetarios deben volver a mostrar valores numéricos","stepMatchArguments":[]}]},
  {"pwTestLine":58,"pickleLine":66,"tags":["@dashboard","@interaction","@expandable"],"steps":[{"pwStepLine":7,"gherkinStepLine":7,"keywordType":"Context","textWithKeyword":"Given que el usuario ha iniciado sesión","isBg":true,"stepMatchArguments":[]},{"pwStepLine":59,"gherkinStepLine":67,"keywordType":"Context","textWithKeyword":"Given que la sección Liquidez comienza expandida","stepMatchArguments":[]},{"pwStepLine":60,"gherkinStepLine":68,"keywordType":"Action","textWithKeyword":"When hace clic en el botón de sección \"Liquidez\"","stepMatchArguments":[{"group":{"start":33,"value":"\"Liquidez\"","children":[{"start":34,"value":"Liquidez","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":61,"gherkinStepLine":69,"keywordType":"Outcome","textWithKeyword":"Then el contenido de Liquidez debe estar oculto","stepMatchArguments":[]},{"pwStepLine":62,"gherkinStepLine":70,"keywordType":"Action","textWithKeyword":"When hace clic en el botón de sección \"Liquidez\" nuevamente","stepMatchArguments":[{"group":{"start":33,"value":"\"Liquidez\"","children":[{"start":34,"value":"Liquidez","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":63,"gherkinStepLine":71,"keywordType":"Outcome","textWithKeyword":"Then el contenido de Liquidez debe estar visible","stepMatchArguments":[]}]},
  {"pwTestLine":66,"pickleLine":74,"tags":["@dashboard","@interaction","@navigation"],"steps":[{"pwStepLine":7,"gherkinStepLine":7,"keywordType":"Context","textWithKeyword":"Given que el usuario ha iniciado sesión","isBg":true,"stepMatchArguments":[]},{"pwStepLine":67,"gherkinStepLine":75,"keywordType":"Action","textWithKeyword":"When hace clic en el enlace \"Ver todas\" de Transacciones Recientes","stepMatchArguments":[{"group":{"start":23,"value":"\"Ver todas\"","children":[{"start":24,"value":"Ver todas","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":68,"gherkinStepLine":76,"keywordType":"Outcome","textWithKeyword":"Then debe ser redirigido a \"/es/transactions\"","stepMatchArguments":[{"group":{"start":22,"value":"\"/es/transactions\"","children":[{"start":23,"value":"/es/transactions","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]}]},
  {"pwTestLine":71,"pickleLine":83,"tags":["@dashboard","@layout","@desktop"],"steps":[{"pwStepLine":7,"gherkinStepLine":7,"keywordType":"Context","textWithKeyword":"Given que el usuario ha iniciado sesión","isBg":true,"stepMatchArguments":[]},{"pwStepLine":72,"gherkinStepLine":84,"keywordType":"Context","textWithKeyword":"Given que la pantalla es de escritorio","stepMatchArguments":[]},{"pwStepLine":73,"gherkinStepLine":85,"keywordType":"Outcome","textWithKeyword":"Then el sidebar de navegación debe ser visible","stepMatchArguments":[]},{"pwStepLine":74,"gherkinStepLine":86,"keywordType":"Outcome","textWithKeyword":"And el sidebar debe contener enlace a \"Dashboard\"","stepMatchArguments":[{"group":{"start":34,"value":"\"Dashboard\"","children":[{"start":35,"value":"Dashboard","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":75,"gherkinStepLine":87,"keywordType":"Outcome","textWithKeyword":"And el sidebar debe contener enlace a \"Transacciones\"","stepMatchArguments":[{"group":{"start":34,"value":"\"Transacciones\"","children":[{"start":35,"value":"Transacciones","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":76,"gherkinStepLine":88,"keywordType":"Outcome","textWithKeyword":"And el sidebar debe contener enlace a \"Cuentas\"","stepMatchArguments":[{"group":{"start":34,"value":"\"Cuentas\"","children":[{"start":35,"value":"Cuentas","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":77,"gherkinStepLine":89,"keywordType":"Outcome","textWithKeyword":"And el sidebar debe contener botón de \"Cerrar Sesión\"","stepMatchArguments":[{"group":{"start":34,"value":"\"Cerrar Sesión\"","children":[{"start":35,"value":"Cerrar Sesión","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]}]},
  {"pwTestLine":80,"pickleLine":92,"tags":["@dashboard","@layout","@mobile"],"steps":[{"pwStepLine":7,"gherkinStepLine":7,"keywordType":"Context","textWithKeyword":"Given que el usuario ha iniciado sesión","isBg":true,"stepMatchArguments":[]},{"pwStepLine":81,"gherkinStepLine":93,"keywordType":"Context","textWithKeyword":"Given que la pantalla es de escritorio","stepMatchArguments":[]},{"pwStepLine":82,"gherkinStepLine":94,"keywordType":"Context","textWithKeyword":"And que el usuario ha iniciado sesión","stepMatchArguments":[]},{"pwStepLine":83,"gherkinStepLine":95,"keywordType":"Context","textWithKeyword":"And que la pantalla es móvil 390x844","stepMatchArguments":[{"group":{"start":25,"value":"390","children":[]},"parameterTypeName":"int"},{"group":{"start":29,"value":"844","children":[]},"parameterTypeName":"int"}]},{"pwStepLine":84,"gherkinStepLine":96,"keywordType":"Outcome","textWithKeyword":"Then la barra inferior de navegación debe ser visible","stepMatchArguments":[]},{"pwStepLine":85,"gherkinStepLine":97,"keywordType":"Outcome","textWithKeyword":"And la barra inferior debe contener enlace a \"Dashboard\"","stepMatchArguments":[{"group":{"start":41,"value":"\"Dashboard\"","children":[{"start":42,"value":"Dashboard","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":86,"gherkinStepLine":98,"keywordType":"Outcome","textWithKeyword":"And la barra inferior debe contener enlace a \"Cuentas\"","stepMatchArguments":[{"group":{"start":41,"value":"\"Cuentas\"","children":[{"start":42,"value":"Cuentas","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]}]},
  {"pwTestLine":89,"pickleLine":101,"tags":["@dashboard","@layout","@navigation"],"steps":[{"pwStepLine":7,"gherkinStepLine":7,"keywordType":"Context","textWithKeyword":"Given que el usuario ha iniciado sesión","isBg":true,"stepMatchArguments":[]},{"pwStepLine":90,"gherkinStepLine":102,"keywordType":"Context","textWithKeyword":"Given que la pantalla es de escritorio","stepMatchArguments":[]},{"pwStepLine":91,"gherkinStepLine":103,"keywordType":"Action","textWithKeyword":"When hace clic en el enlace \"Cuentas\" del sidebar","stepMatchArguments":[{"group":{"start":23,"value":"\"Cuentas\"","children":[{"start":24,"value":"Cuentas","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":92,"gherkinStepLine":104,"keywordType":"Outcome","textWithKeyword":"Then debe ser redirigido a \"/es/accounts\"","stepMatchArguments":[{"group":{"start":22,"value":"\"/es/accounts\"","children":[{"start":23,"value":"/es/accounts","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]}]},
  {"pwTestLine":95,"pickleLine":107,"tags":["@dashboard","@layout","@desktop"],"steps":[{"pwStepLine":7,"gherkinStepLine":7,"keywordType":"Context","textWithKeyword":"Given que el usuario ha iniciado sesión","isBg":true,"stepMatchArguments":[]},{"pwStepLine":96,"gherkinStepLine":108,"keywordType":"Outcome","textWithKeyword":"Then el enlace \"Dashboard\" en el sidebar debe estar marcado como activo","stepMatchArguments":[{"group":{"start":10,"value":"\"Dashboard\"","children":[{"start":11,"value":"Dashboard","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]}]},
  {"pwTestLine":99,"pickleLine":115,"tags":["@dashboard","@i18n"],"steps":[{"pwStepLine":7,"gherkinStepLine":7,"keywordType":"Context","textWithKeyword":"Given que el usuario ha iniciado sesión","isBg":true,"stepMatchArguments":[]},{"pwStepLine":100,"gherkinStepLine":116,"keywordType":"Context","textWithKeyword":"Given que la pantalla es de escritorio","stepMatchArguments":[]},{"pwStepLine":101,"gherkinStepLine":117,"keywordType":"Context","textWithKeyword":"And que el usuario ha iniciado sesión en inglés","stepMatchArguments":[]},{"pwStepLine":102,"gherkinStepLine":118,"keywordType":"Outcome","textWithKeyword":"Then debe ver el contenido principal del dashboard","stepMatchArguments":[]},{"pwStepLine":103,"gherkinStepLine":119,"keywordType":"Outcome","textWithKeyword":"And debe ver el label \"Net Worth\" en el dashboard","stepMatchArguments":[{"group":{"start":18,"value":"\"Net Worth\"","children":[{"start":19,"value":"Net Worth","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":104,"gherkinStepLine":120,"keywordType":"Outcome","textWithKeyword":"And debe ver el label \"Total Cash\" en las métricas","stepMatchArguments":[{"group":{"start":18,"value":"\"Total Cash\"","children":[{"start":19,"value":"Total Cash","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":105,"gherkinStepLine":121,"keywordType":"Outcome","textWithKeyword":"And la Distribución Patrimonial debe mostrar empty state \"No Data\"","stepMatchArguments":[{"group":{"start":53,"value":"\"No Data\"","children":[{"start":54,"value":"No Data","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":106,"gherkinStepLine":122,"keywordType":"Outcome","textWithKeyword":"And las Transacciones Recientes deben mostrar empty state \"No Transactions\"","stepMatchArguments":[{"group":{"start":54,"value":"\"No Transactions\"","children":[{"start":55,"value":"No Transactions","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]}]},
  {"pwTestLine":109,"pickleLine":129,"tags":["@dashboard","@loading","@skeleton"],"steps":[{"pwStepLine":7,"gherkinStepLine":7,"keywordType":"Context","textWithKeyword":"Given que el usuario ha iniciado sesión","isBg":true,"stepMatchArguments":[]},{"pwStepLine":110,"gherkinStepLine":130,"keywordType":"Action","textWithKeyword":"When navega al dashboard","stepMatchArguments":[]},{"pwStepLine":111,"gherkinStepLine":131,"keywordType":"Outcome","textWithKeyword":"Then el skeleton de carga debe mostrarse inicialmente","stepMatchArguments":[]},{"pwStepLine":112,"gherkinStepLine":132,"keywordType":"Outcome","textWithKeyword":"And eventualmente debe reemplazarse con el contenido real","stepMatchArguments":[]}]},
]; // bdd-data-end