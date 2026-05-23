// Generated from: e2e\features\transactions.feature
import { test } from "playwright-bdd";

test.describe('Gestión de Transacciones', () => {

  test('La página de transacciones carga correctamente en desktop', { tag: ['@transactions', '@visual', '@happy-path', '@desktop'] }, async ({ Given, Then, And, page }) => { 
    await Given('que el usuario de transacciones ha iniciado sesión', null, { page }); 
    await And('navega a la página de transacciones', null, { page }); 
    await Given('que la pantalla es de escritorio', null, { page }); 
    await Then('debe ver el título "Transacciones"', null, { page }); 
    await And('debe ver la tabla de transacciones', null, { page }); 
    await And('debe ver los encabezados "Fecha", "Descripción", "Tipo", "Cuenta", "Monto"', null, { page }); 
  });

  test('Las transacciones se muestran con formato correcto', { tag: ['@transactions', '@visual'] }, async ({ Given, Then, And, page }) => { 
    await Given('que el usuario de transacciones ha iniciado sesión', null, { page }); 
    await And('navega a la página de transacciones', null, { page }); 
    await Then('los montos de gastos deben mostrarse en color rojo', null, { page }); 
    await And('los montos de ingresos deben mostrarse en color verde', null, { page }); 
  });

  test('Filtro de búsqueda por descripción actualiza la URL', { tag: ['@transactions', '@filter'] }, async ({ Given, When, Then, And, page }) => { 
    await Given('que el usuario de transacciones ha iniciado sesión', null, { page }); 
    await And('navega a la página de transacciones', null, { page }); 
    await When('escribe "nomina" en el campo de búsqueda', null, { page }); 
    await And('espera el debounce de búsqueda', null, { page }); 
    await Then('la URL debe contener "search=nomina"', null, { page }); 
  });

  test('Filtro por tipo de transacción funciona', { tag: ['@transactions', '@filter'] }, async ({ Given, When, Then, And, page }) => { 
    await Given('que el usuario de transacciones ha iniciado sesión', null, { page }); 
    await And('navega a la página de transacciones', null, { page }); 
    await When('selecciona "Gasto" en el filtro de tipo', null, { page }); 
    await Then('la URL debe contener "type=EXPENSE"', null, { page }); 
  });

  test('Filtro por rango de fechas funciona', { tag: ['@transactions', '@filter'] }, async ({ Given, When, Then, And, page }) => { 
    await Given('que el usuario de transacciones ha iniciado sesión', null, { page }); 
    await And('navega a la página de transacciones', null, { page }); 
    await When('ingresa "2026-01-01" en el campo fecha desde', null, { page }); 
    await And('ingresa "2026-02-01" en el campo fecha hasta', null, { page }); 
    await Then('la URL debe contener "dateFrom=2026-01-01"', null, { page }); 
    await And('la URL debe contener "dateTo=2026-02-01"', null, { page }); 
  });

  test('Los filtros se pueden limpiar desde la URL', { tag: ['@transactions', '@filter'] }, async ({ Given, When, Then, And, page }) => { 
    await Given('que el usuario de transacciones ha iniciado sesión', null, { page }); 
    await And('navega a la página de transacciones', null, { page }); 
    await Given('que hay filtros activos en la URL', null, { page }); 
    await When('limpia todos los filtros', null, { page }); 
    await Then('la URL no debe tener parámetros de filtro', null, { page }); 
  });

  test('La paginación muestra el total de transacciones', { tag: ['@transactions', '@pagination'] }, async ({ Given, Then, And, page }) => { 
    await Given('que el usuario de transacciones ha iniciado sesión', null, { page }); 
    await And('navega a la página de transacciones', null, { page }); 
    await Then('debe ver el texto de paginación', null, { page }); 
    await And('el botón "Página anterior" debe estar deshabilitado', null, { page }); 
  });

  test('La paginación permite navegar a la página siguiente', { tag: ['@transactions', '@pagination'] }, async ({ Given, When, Then, And, page }) => { 
    await Given('que el usuario de transacciones ha iniciado sesión', null, { page }); 
    await And('navega a la página de transacciones', null, { page }); 
    await When('hace clic en "Página siguiente"', null, { page }); 
    await Then('la URL debe contener "page=2"', null, { page }); 
    await And('debe ver el texto "11–20 de 20 transacciones"', null, { page }); 
  });

  test('El botón de página anterior se habilita en página 2', { tag: ['@transactions', '@pagination'] }, async ({ Given, Then, And, page }) => { 
    await Given('que el usuario de transacciones ha iniciado sesión', null, { page }); 
    await And('navega a la página de transacciones', null, { page }); 
    await Given('que navega a la página 2 de transacciones', null, { page }); 
    await Then('el botón "Página anterior" debe estar habilitado', null, { page }); 
  });

  test('El modal de crear transacción abre con todos los campos', { tag: ['@transactions', '@modal'] }, async ({ Given, When, Then, And, page }) => { 
    await Given('que el usuario de transacciones ha iniciado sesión', null, { page }); 
    await And('navega a la página de transacciones', null, { page }); 
    await When('hace clic en "Nueva transacción"', null, { page }); 
    await Then('debe ver un diálogo con título "Crear transacción"', null, { page }); 
    await And('debe ver el campo tipo con opciones "Gasto" e "Ingreso"', null, { page }); 
    await And('debe ver el campo cuenta', null, { page }); 
    await And('debe ver el campo valor', null, { page }); 
    await And('debe ver el campo descripción', null, { page }); 
    await And('debe ver el campo fecha', null, { page }); 
    await And('debe ver el botón "Crear transacción"', null, { page }); 
    await And('debe ver el botón "Cancelar"', null, { page }); 
  });

  test('El modal de crear transacción cierra con Escape', { tag: ['@transactions', '@modal', '@close'] }, async ({ Given, When, Then, And, page }) => { 
    await Given('que el usuario de transacciones ha iniciado sesión', null, { page }); 
    await And('navega a la página de transacciones', null, { page }); 
    await Given('que el modal de transacción está abierto', null, { page }); 
    await When('presiona la tecla Escape', null, { page }); 
    await Then('el diálogo debe estar cerrado', null, { page }); 
  });

  test('El modal de crear transacción cierra con botón Cancelar', { tag: ['@transactions', '@modal', '@close'] }, async ({ Given, When, Then, And, page }) => { 
    await Given('que el usuario de transacciones ha iniciado sesión', null, { page }); 
    await And('navega a la página de transacciones', null, { page }); 
    await Given('que el modal de transacción está abierto', null, { page }); 
    await When('hace clic en "Cancelar" en el modal', null, { page }); 
    await Then('el diálogo debe estar cerrado', null, { page }); 
  });

  test('El formulario de crear transacción valida campos requeridos', { tag: ['@transactions', '@modal', '@validation'] }, async ({ Given, When, Then, And, page }) => { 
    await Given('que el usuario de transacciones ha iniciado sesión', null, { page }); 
    await And('navega a la página de transacciones', null, { page }); 
    await Given('que el modal de transacción está abierto', null, { page }); 
    await When('intenta enviar el formulario de transacción vacío', null, { page }); 
    await Then('debe ver mensajes de error de validación', null, { page }); 
    await And('el campo cuenta debe mostrar error', null, { page }); 
    await And('el campo valor debe mostrar error', null, { page }); 
  });

  test('Crear una transacción de ingreso exitosamente', { tag: ['@transactions', '@create', '@happy-path'] }, async ({ Given, When, Then, And, page }) => { 
    await Given('que el usuario de transacciones ha iniciado sesión', null, { page }); 
    await And('navega a la página de transacciones', null, { page }); 
    await Given('que el modal de transacción está abierto', null, { page }); 
    await When('selecciona "Ingreso" como tipo', null, { page }); 
    await And('selecciona "Efectivo" como cuenta', null, { page }); 
    await And('ingresa "50000" en el campo valor', null, { page }); 
    await And('ingresa "Ingreso de prueba E2E" como descripción', null, { page }); 
    await And('envía el formulario de creación de transacción', null, { page }); 
    await Then('debe ver una notificación de éxito', null, { page }); 
    await And('la transacción debe aparecer en la tabla', null, { page }); 
  });

  test('La página de transacciones es responsive en mobile', { tag: ['@mobile', '@transactions'] }, async ({ Given, When, Then, And, page }) => { 
    await Given('que el usuario de transacciones ha iniciado sesión', null, { page }); 
    await Given('que la pantalla es móvil 390x844', null, { page }); 
    await When('navega a la página de transacciones', null, { page }); 
    await Then('debe ver el título "Transacciones"', null, { page }); 
    await And('la tabla de transacciones debe ser visible', null, { page }); 
  });

});

// == technical section ==

test.use({
  $test: [({}, use) => use(test), { scope: 'test', box: true }],
  $uri: [({}, use) => use('e2e\\features\\transactions.feature'), { scope: 'test', box: true }],
  $bddFileData: [({}, use) => use(bddFileData), { scope: "test", box: true }],
});

const bddFileData = [ // bdd-data-start
  {"pwTestLine":6,"pickleLine":16,"tags":["@transactions","@visual","@happy-path","@desktop"],"steps":[{"pwStepLine":7,"gherkinStepLine":17,"keywordType":"Context","textWithKeyword":"Given que el usuario de transacciones ha iniciado sesión","stepMatchArguments":[]},{"pwStepLine":8,"gherkinStepLine":18,"keywordType":"Context","textWithKeyword":"And navega a la página de transacciones","stepMatchArguments":[]},{"pwStepLine":9,"gherkinStepLine":19,"keywordType":"Context","textWithKeyword":"Given que la pantalla es de escritorio","stepMatchArguments":[]},{"pwStepLine":10,"gherkinStepLine":20,"keywordType":"Outcome","textWithKeyword":"Then debe ver el título \"Transacciones\"","stepMatchArguments":[{"group":{"start":19,"value":"\"Transacciones\"","children":[{"start":20,"value":"Transacciones","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":11,"gherkinStepLine":21,"keywordType":"Outcome","textWithKeyword":"And debe ver la tabla de transacciones","stepMatchArguments":[]},{"pwStepLine":12,"gherkinStepLine":22,"keywordType":"Outcome","textWithKeyword":"And debe ver los encabezados \"Fecha\", \"Descripción\", \"Tipo\", \"Cuenta\", \"Monto\"","stepMatchArguments":[{"group":{"start":25,"value":"\"Fecha\"","children":[{"start":26,"value":"Fecha","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"},{"group":{"start":34,"value":"\"Descripción\"","children":[{"start":35,"value":"Descripción","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"},{"group":{"start":49,"value":"\"Tipo\"","children":[{"start":50,"value":"Tipo","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"},{"group":{"start":57,"value":"\"Cuenta\"","children":[{"start":58,"value":"Cuenta","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"},{"group":{"start":67,"value":"\"Monto\"","children":[{"start":68,"value":"Monto","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]}]},
  {"pwTestLine":15,"pickleLine":25,"tags":["@transactions","@visual"],"steps":[{"pwStepLine":16,"gherkinStepLine":26,"keywordType":"Context","textWithKeyword":"Given que el usuario de transacciones ha iniciado sesión","stepMatchArguments":[]},{"pwStepLine":17,"gherkinStepLine":27,"keywordType":"Context","textWithKeyword":"And navega a la página de transacciones","stepMatchArguments":[]},{"pwStepLine":18,"gherkinStepLine":28,"keywordType":"Outcome","textWithKeyword":"Then los montos de gastos deben mostrarse en color rojo","stepMatchArguments":[]},{"pwStepLine":19,"gherkinStepLine":29,"keywordType":"Outcome","textWithKeyword":"And los montos de ingresos deben mostrarse en color verde","stepMatchArguments":[]}]},
  {"pwTestLine":22,"pickleLine":36,"tags":["@transactions","@filter"],"steps":[{"pwStepLine":23,"gherkinStepLine":37,"keywordType":"Context","textWithKeyword":"Given que el usuario de transacciones ha iniciado sesión","stepMatchArguments":[]},{"pwStepLine":24,"gherkinStepLine":38,"keywordType":"Context","textWithKeyword":"And navega a la página de transacciones","stepMatchArguments":[]},{"pwStepLine":25,"gherkinStepLine":39,"keywordType":"Action","textWithKeyword":"When escribe \"nomina\" en el campo de búsqueda","stepMatchArguments":[{"group":{"start":8,"value":"\"nomina\"","children":[{"start":9,"value":"nomina","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":26,"gherkinStepLine":40,"keywordType":"Action","textWithKeyword":"And espera el debounce de búsqueda","stepMatchArguments":[]},{"pwStepLine":27,"gherkinStepLine":41,"keywordType":"Outcome","textWithKeyword":"Then la URL debe contener \"search=nomina\"","stepMatchArguments":[{"group":{"start":21,"value":"\"search=nomina\"","children":[{"start":22,"value":"search=nomina","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]}]},
  {"pwTestLine":30,"pickleLine":44,"tags":["@transactions","@filter"],"steps":[{"pwStepLine":31,"gherkinStepLine":45,"keywordType":"Context","textWithKeyword":"Given que el usuario de transacciones ha iniciado sesión","stepMatchArguments":[]},{"pwStepLine":32,"gherkinStepLine":46,"keywordType":"Context","textWithKeyword":"And navega a la página de transacciones","stepMatchArguments":[]},{"pwStepLine":33,"gherkinStepLine":47,"keywordType":"Action","textWithKeyword":"When selecciona \"Gasto\" en el filtro de tipo","stepMatchArguments":[{"group":{"start":11,"value":"\"Gasto\"","children":[{"start":12,"value":"Gasto","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":34,"gherkinStepLine":48,"keywordType":"Outcome","textWithKeyword":"Then la URL debe contener \"type=EXPENSE\"","stepMatchArguments":[{"group":{"start":21,"value":"\"type=EXPENSE\"","children":[{"start":22,"value":"type=EXPENSE","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]}]},
  {"pwTestLine":37,"pickleLine":51,"tags":["@transactions","@filter"],"steps":[{"pwStepLine":38,"gherkinStepLine":52,"keywordType":"Context","textWithKeyword":"Given que el usuario de transacciones ha iniciado sesión","stepMatchArguments":[]},{"pwStepLine":39,"gherkinStepLine":53,"keywordType":"Context","textWithKeyword":"And navega a la página de transacciones","stepMatchArguments":[]},{"pwStepLine":40,"gherkinStepLine":54,"keywordType":"Action","textWithKeyword":"When ingresa \"2026-01-01\" en el campo fecha desde","stepMatchArguments":[{"group":{"start":8,"value":"\"2026-01-01\"","children":[{"start":9,"value":"2026-01-01","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":41,"gherkinStepLine":55,"keywordType":"Action","textWithKeyword":"And ingresa \"2026-02-01\" en el campo fecha hasta","stepMatchArguments":[{"group":{"start":8,"value":"\"2026-02-01\"","children":[{"start":9,"value":"2026-02-01","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":42,"gherkinStepLine":56,"keywordType":"Outcome","textWithKeyword":"Then la URL debe contener \"dateFrom=2026-01-01\"","stepMatchArguments":[{"group":{"start":21,"value":"\"dateFrom=2026-01-01\"","children":[{"start":22,"value":"dateFrom=2026-01-01","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":43,"gherkinStepLine":57,"keywordType":"Outcome","textWithKeyword":"And la URL debe contener \"dateTo=2026-02-01\"","stepMatchArguments":[{"group":{"start":21,"value":"\"dateTo=2026-02-01\"","children":[{"start":22,"value":"dateTo=2026-02-01","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]}]},
  {"pwTestLine":46,"pickleLine":60,"tags":["@transactions","@filter"],"steps":[{"pwStepLine":47,"gherkinStepLine":61,"keywordType":"Context","textWithKeyword":"Given que el usuario de transacciones ha iniciado sesión","stepMatchArguments":[]},{"pwStepLine":48,"gherkinStepLine":62,"keywordType":"Context","textWithKeyword":"And navega a la página de transacciones","stepMatchArguments":[]},{"pwStepLine":49,"gherkinStepLine":63,"keywordType":"Context","textWithKeyword":"Given que hay filtros activos en la URL","stepMatchArguments":[]},{"pwStepLine":50,"gherkinStepLine":64,"keywordType":"Action","textWithKeyword":"When limpia todos los filtros","stepMatchArguments":[]},{"pwStepLine":51,"gherkinStepLine":65,"keywordType":"Outcome","textWithKeyword":"Then la URL no debe tener parámetros de filtro","stepMatchArguments":[]}]},
  {"pwTestLine":54,"pickleLine":72,"tags":["@transactions","@pagination"],"steps":[{"pwStepLine":55,"gherkinStepLine":73,"keywordType":"Context","textWithKeyword":"Given que el usuario de transacciones ha iniciado sesión","stepMatchArguments":[]},{"pwStepLine":56,"gherkinStepLine":74,"keywordType":"Context","textWithKeyword":"And navega a la página de transacciones","stepMatchArguments":[]},{"pwStepLine":57,"gherkinStepLine":75,"keywordType":"Outcome","textWithKeyword":"Then debe ver el texto de paginación","stepMatchArguments":[]},{"pwStepLine":58,"gherkinStepLine":76,"keywordType":"Outcome","textWithKeyword":"And el botón \"Página anterior\" debe estar deshabilitado","stepMatchArguments":[{"group":{"start":9,"value":"\"Página anterior\"","children":[{"start":10,"value":"Página anterior","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]}]},
  {"pwTestLine":61,"pickleLine":79,"tags":["@transactions","@pagination"],"steps":[{"pwStepLine":62,"gherkinStepLine":80,"keywordType":"Context","textWithKeyword":"Given que el usuario de transacciones ha iniciado sesión","stepMatchArguments":[]},{"pwStepLine":63,"gherkinStepLine":81,"keywordType":"Context","textWithKeyword":"And navega a la página de transacciones","stepMatchArguments":[]},{"pwStepLine":64,"gherkinStepLine":82,"keywordType":"Action","textWithKeyword":"When hace clic en \"Página siguiente\"","stepMatchArguments":[{"group":{"start":13,"value":"\"Página siguiente\"","children":[{"start":14,"value":"Página siguiente","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":65,"gherkinStepLine":83,"keywordType":"Outcome","textWithKeyword":"Then la URL debe contener \"page=2\"","stepMatchArguments":[{"group":{"start":21,"value":"\"page=2\"","children":[{"start":22,"value":"page=2","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":66,"gherkinStepLine":84,"keywordType":"Outcome","textWithKeyword":"And debe ver el texto \"11–20 de 20 transacciones\"","stepMatchArguments":[{"group":{"start":18,"value":"\"11–20 de 20 transacciones\"","children":[{"start":19,"value":"11–20 de 20 transacciones","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]}]},
  {"pwTestLine":69,"pickleLine":87,"tags":["@transactions","@pagination"],"steps":[{"pwStepLine":70,"gherkinStepLine":88,"keywordType":"Context","textWithKeyword":"Given que el usuario de transacciones ha iniciado sesión","stepMatchArguments":[]},{"pwStepLine":71,"gherkinStepLine":89,"keywordType":"Context","textWithKeyword":"And navega a la página de transacciones","stepMatchArguments":[]},{"pwStepLine":72,"gherkinStepLine":90,"keywordType":"Context","textWithKeyword":"Given que navega a la página 2 de transacciones","stepMatchArguments":[]},{"pwStepLine":73,"gherkinStepLine":91,"keywordType":"Outcome","textWithKeyword":"Then el botón \"Página anterior\" debe estar habilitado","stepMatchArguments":[{"group":{"start":9,"value":"\"Página anterior\"","children":[{"start":10,"value":"Página anterior","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]}]},
  {"pwTestLine":76,"pickleLine":98,"tags":["@transactions","@modal"],"steps":[{"pwStepLine":77,"gherkinStepLine":99,"keywordType":"Context","textWithKeyword":"Given que el usuario de transacciones ha iniciado sesión","stepMatchArguments":[]},{"pwStepLine":78,"gherkinStepLine":100,"keywordType":"Context","textWithKeyword":"And navega a la página de transacciones","stepMatchArguments":[]},{"pwStepLine":79,"gherkinStepLine":101,"keywordType":"Action","textWithKeyword":"When hace clic en \"Nueva transacción\"","stepMatchArguments":[{"group":{"start":13,"value":"\"Nueva transacción\"","children":[{"start":14,"value":"Nueva transacción","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":80,"gherkinStepLine":102,"keywordType":"Outcome","textWithKeyword":"Then debe ver un diálogo con título \"Crear transacción\"","stepMatchArguments":[{"group":{"start":31,"value":"\"Crear transacción\"","children":[{"start":32,"value":"Crear transacción","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":81,"gherkinStepLine":103,"keywordType":"Outcome","textWithKeyword":"And debe ver el campo tipo con opciones \"Gasto\" e \"Ingreso\"","stepMatchArguments":[{"group":{"start":36,"value":"\"Gasto\"","children":[{"start":37,"value":"Gasto","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"},{"group":{"start":46,"value":"\"Ingreso\"","children":[{"start":47,"value":"Ingreso","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":82,"gherkinStepLine":104,"keywordType":"Outcome","textWithKeyword":"And debe ver el campo cuenta","stepMatchArguments":[]},{"pwStepLine":83,"gherkinStepLine":105,"keywordType":"Outcome","textWithKeyword":"And debe ver el campo valor","stepMatchArguments":[]},{"pwStepLine":84,"gherkinStepLine":106,"keywordType":"Outcome","textWithKeyword":"And debe ver el campo descripción","stepMatchArguments":[]},{"pwStepLine":85,"gherkinStepLine":107,"keywordType":"Outcome","textWithKeyword":"And debe ver el campo fecha","stepMatchArguments":[]},{"pwStepLine":86,"gherkinStepLine":108,"keywordType":"Outcome","textWithKeyword":"And debe ver el botón \"Crear transacción\"","stepMatchArguments":[{"group":{"start":18,"value":"\"Crear transacción\"","children":[{"start":19,"value":"Crear transacción","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":87,"gherkinStepLine":109,"keywordType":"Outcome","textWithKeyword":"And debe ver el botón \"Cancelar\"","stepMatchArguments":[{"group":{"start":18,"value":"\"Cancelar\"","children":[{"start":19,"value":"Cancelar","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]}]},
  {"pwTestLine":90,"pickleLine":112,"tags":["@transactions","@modal","@close"],"steps":[{"pwStepLine":91,"gherkinStepLine":113,"keywordType":"Context","textWithKeyword":"Given que el usuario de transacciones ha iniciado sesión","stepMatchArguments":[]},{"pwStepLine":92,"gherkinStepLine":114,"keywordType":"Context","textWithKeyword":"And navega a la página de transacciones","stepMatchArguments":[]},{"pwStepLine":93,"gherkinStepLine":115,"keywordType":"Context","textWithKeyword":"Given que el modal de transacción está abierto","stepMatchArguments":[]},{"pwStepLine":94,"gherkinStepLine":116,"keywordType":"Action","textWithKeyword":"When presiona la tecla Escape","stepMatchArguments":[]},{"pwStepLine":95,"gherkinStepLine":117,"keywordType":"Outcome","textWithKeyword":"Then el diálogo debe estar cerrado","stepMatchArguments":[]}]},
  {"pwTestLine":98,"pickleLine":120,"tags":["@transactions","@modal","@close"],"steps":[{"pwStepLine":99,"gherkinStepLine":121,"keywordType":"Context","textWithKeyword":"Given que el usuario de transacciones ha iniciado sesión","stepMatchArguments":[]},{"pwStepLine":100,"gherkinStepLine":122,"keywordType":"Context","textWithKeyword":"And navega a la página de transacciones","stepMatchArguments":[]},{"pwStepLine":101,"gherkinStepLine":123,"keywordType":"Context","textWithKeyword":"Given que el modal de transacción está abierto","stepMatchArguments":[]},{"pwStepLine":102,"gherkinStepLine":124,"keywordType":"Action","textWithKeyword":"When hace clic en \"Cancelar\" en el modal","stepMatchArguments":[{"group":{"start":13,"value":"\"Cancelar\"","children":[{"start":14,"value":"Cancelar","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":103,"gherkinStepLine":125,"keywordType":"Outcome","textWithKeyword":"Then el diálogo debe estar cerrado","stepMatchArguments":[]}]},
  {"pwTestLine":106,"pickleLine":128,"tags":["@transactions","@modal","@validation"],"steps":[{"pwStepLine":107,"gherkinStepLine":129,"keywordType":"Context","textWithKeyword":"Given que el usuario de transacciones ha iniciado sesión","stepMatchArguments":[]},{"pwStepLine":108,"gherkinStepLine":130,"keywordType":"Context","textWithKeyword":"And navega a la página de transacciones","stepMatchArguments":[]},{"pwStepLine":109,"gherkinStepLine":131,"keywordType":"Context","textWithKeyword":"Given que el modal de transacción está abierto","stepMatchArguments":[]},{"pwStepLine":110,"gherkinStepLine":132,"keywordType":"Action","textWithKeyword":"When intenta enviar el formulario de transacción vacío","stepMatchArguments":[]},{"pwStepLine":111,"gherkinStepLine":133,"keywordType":"Outcome","textWithKeyword":"Then debe ver mensajes de error de validación","stepMatchArguments":[]},{"pwStepLine":112,"gherkinStepLine":134,"keywordType":"Outcome","textWithKeyword":"And el campo cuenta debe mostrar error","stepMatchArguments":[]},{"pwStepLine":113,"gherkinStepLine":135,"keywordType":"Outcome","textWithKeyword":"And el campo valor debe mostrar error","stepMatchArguments":[]}]},
  {"pwTestLine":116,"pickleLine":138,"tags":["@transactions","@create","@happy-path"],"steps":[{"pwStepLine":117,"gherkinStepLine":139,"keywordType":"Context","textWithKeyword":"Given que el usuario de transacciones ha iniciado sesión","stepMatchArguments":[]},{"pwStepLine":118,"gherkinStepLine":140,"keywordType":"Context","textWithKeyword":"And navega a la página de transacciones","stepMatchArguments":[]},{"pwStepLine":119,"gherkinStepLine":141,"keywordType":"Context","textWithKeyword":"Given que el modal de transacción está abierto","stepMatchArguments":[]},{"pwStepLine":120,"gherkinStepLine":142,"keywordType":"Action","textWithKeyword":"When selecciona \"Ingreso\" como tipo","stepMatchArguments":[{"group":{"start":11,"value":"\"Ingreso\"","children":[{"start":12,"value":"Ingreso","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":121,"gherkinStepLine":143,"keywordType":"Action","textWithKeyword":"And selecciona \"Efectivo\" como cuenta","stepMatchArguments":[{"group":{"start":11,"value":"\"Efectivo\"","children":[{"start":12,"value":"Efectivo","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":122,"gherkinStepLine":144,"keywordType":"Action","textWithKeyword":"And ingresa \"50000\" en el campo valor","stepMatchArguments":[{"group":{"start":8,"value":"\"50000\"","children":[{"start":9,"value":"50000","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":123,"gherkinStepLine":145,"keywordType":"Action","textWithKeyword":"And ingresa \"Ingreso de prueba E2E\" como descripción","stepMatchArguments":[{"group":{"start":8,"value":"\"Ingreso de prueba E2E\"","children":[{"start":9,"value":"Ingreso de prueba E2E","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":124,"gherkinStepLine":146,"keywordType":"Action","textWithKeyword":"And envía el formulario de creación de transacción","stepMatchArguments":[]},{"pwStepLine":125,"gherkinStepLine":147,"keywordType":"Outcome","textWithKeyword":"Then debe ver una notificación de éxito","stepMatchArguments":[]},{"pwStepLine":126,"gherkinStepLine":148,"keywordType":"Outcome","textWithKeyword":"And la transacción debe aparecer en la tabla","stepMatchArguments":[]}]},
  {"pwTestLine":129,"pickleLine":155,"tags":["@mobile","@transactions"],"steps":[{"pwStepLine":130,"gherkinStepLine":156,"keywordType":"Context","textWithKeyword":"Given que el usuario de transacciones ha iniciado sesión","stepMatchArguments":[]},{"pwStepLine":131,"gherkinStepLine":157,"keywordType":"Context","textWithKeyword":"Given que la pantalla es móvil 390x844","stepMatchArguments":[{"group":{"start":25,"value":"390","children":[]},"parameterTypeName":"int"},{"group":{"start":29,"value":"844","children":[]},"parameterTypeName":"int"}]},{"pwStepLine":132,"gherkinStepLine":158,"keywordType":"Action","textWithKeyword":"When navega a la página de transacciones","stepMatchArguments":[]},{"pwStepLine":133,"gherkinStepLine":159,"keywordType":"Outcome","textWithKeyword":"Then debe ver el título \"Transacciones\"","stepMatchArguments":[{"group":{"start":19,"value":"\"Transacciones\"","children":[{"start":20,"value":"Transacciones","children":[{"children":[]}]},{"children":[{"children":[]}]}]},"parameterTypeName":"string"}]},{"pwStepLine":134,"gherkinStepLine":160,"keywordType":"Outcome","textWithKeyword":"And la tabla de transacciones debe ser visible","stepMatchArguments":[]}]},
]; // bdd-data-end