# PROCESS.md — Proceso de Trabajo del Tech Lead

Este documento describe el proceso que sigue el agente **tech-lead** (orquestador principal) cada vez que recibes una instrucción de agregar funcionalidad, corregir algo o auditar un módulo. Es la guía operativa de cómo se ejecuta el trabajo en FinanceTrackerPro.

---

## 1. Fase 0 — Análisis Inicial (siempre primero)

Antes de tocar código o delegar, el Tech Lead:

1. **Lee el contexto**: archivos del módulo afectado, documentación (`CLAUDE.md`, `AGENTS.md`, `README.md`, `DATABASE.md`), estado de Git (`git status`, `git log --oneline -10`).
2. **Clasifica la tarea**:

   | Tipo de tarea         | Workflow                                                               |
   | --------------------- | ---------------------------------------------------------------------- |
   | Feature full-stack    | `dev-backend` → `dev-frontend` → `dev-tester` → `dev-e2e` → `qa-lead`  |
   | Feature solo backend  | `dev-backend` → `dev-tester` → `qa-lead`                               |
   | Feature solo frontend | `dev-frontend` → `dev-tester` → `dev-e2e` → `qa-lead`                  |
   | Bug fix               | agente responsable → `dev-tester` → `qa-lead`                          |
   | Auditoría de módulo   | Investigación (solo lectura) → informe de hallazgos → plan → ejecución |
   | Seguridad             | `sec-ops` → `dev-backend` → `qa-lead`                                  |
   | Integridad financiera | `audit-finance` → `dev-backend` → `dev-tester` → `qa-lead`             |

3. **Verifica el estado actual**: qué tests existen, cobertura, si el módulo ya tiene backend sin UI (como pasó con transferencias), si hay deuda previa.
4. **Presenta el plan al usuario** con severidades (🔴 MAYOR / 🟠 MEDIO / 🟡 MENOR), decisiones de arquitectura y preguntas puntuales. **No se toca código hasta que el usuario aprueba.**

> Regla aprendida en la sesión: cuando el usuario reporta un bug, primero se investiga la causa raíz con evidencia (logs, código, error-context) y se presenta el diagnóstico antes de delegar.

---

## 2. Fase 1 — Delegación a Subagentes

### Briefing estructurado (obligatorio para cada subagente)

Cada invocación de un subagente incluye:

```
## Briefing para [subagente]
- Tarea: qué construir/corregir (conciso)
- Contexto: por qué, qué descubrió el Tech Lead, qué ya existe
- Archivos a modificar: rutas exactas (src/actions/x.ts, prisma/schema.prisma, ...)
- Restricciones: reglas de CLAUDE.md aplicables (Rule 3 $transaction, Rule 5 Zod, Rule 13 getTrueBalance, ...)
- Entregable: qué debe reportar al final
- Verificación obligatoria: comandos exactos que DEBE ejecutar antes de reportar
- Contrato: qué consume el siguiente agente (códigos de error, forma de los datos)
```

### Orden y paralelismo

- **Secuencial** cuando hay dependencias (frontend consume lo que backend define).
- **En paralelo** cuando los archivos son disjuntos (p. ej. `dev-backend` en server actions mientras `dev-frontend` en componentes) — el Tech Lead delimita archivos para evitar conflictos.
- Los subagentes se reanudan con `task_id` para tareas de continuación (fixes puntuales sobre su propio trabajo).

### Subagentes y su rol

| Subagente       | Rol                                                 | Cuándo                                                            |
| --------------- | --------------------------------------------------- | ----------------------------------------------------------------- |
| `dev-backend`   | Server Actions, Prisma, migraciones, Zod, seguridad | Lógica de servidor, DB, cálculos monetarios                       |
| `dev-frontend`  | UI, Tailwind, i18n, accesibilidad WCAG              | Componentes, modales, páginas                                     |
| `dev-tester`    | Tests unit/integración, coverage ≥ 70%              | Después de cualquier implementación                               |
| `dev-e2e`       | Playwright + Cucumber BDD (Gherkin)                 | Después de `dev-tester`                                           |
| `qa-lead`       | Auditoría 14 reglas + quality gates                 | Último paso (si el agente no está disponible, el Tech Lead asume) |
| `sec-ops`       | Auditoría OWASP                                     | Cambios en auth/pagos/datos sensibles                             |
| `audit-finance` | Integridad del ledger (solo lectura)                | Cambios en cálculos monetarios                                    |

---

## 3. Fase 2 — Verificación del Tech Lead

Después de CADA subagente, el Tech Lead valida antes de pasar al siguiente:

1. Lee los archivos clave del entregable (calidad, no solo exit code).
2. Ejecuta los checks obligatorios:

```powershell
npx tsc --noEmit                          # TypeScript — exit 0
npx eslint . --max-warnings=0             # ESLint — exit 0
npx vitest run --coverage                 # Suite completa + cobertura ≥ 70%
npm run build                             # Build de producción
```

3. Verifica migraciones aplicadas a las 3 DB (dev 5432, e2e 5433, test 5434) cuando hay cambios de schema:

```powershell
npx prisma migrate dev --name <nombre>    # dev (interactivo)
$env:PRISMA_E2E="1"; $env:DATABASE_URL="postgresql://postgres:admin@localhost:5434/financetrackerpro_test"; npx prisma migrate deploy
```

4. Si hay hallazgos (tests rotos, violaciones), **reanuda al subagente responsable** con el error exacto — no se reinicia el ciclo completo.

---

## 4. Fase 3 — Testing E2E

```powershell
npm run db:reset:e2e                      # limpia la DB e2e (la suite la resetea igual en global-setup)
npx bddgen                                # genera specs desde .feature files
npx playwright test --grep "Nombre Feature" --workers=1   # feature específico
npx playwright test --workers=1           # suite COMPLETA (obligatorio antes de merge cuando hay mutación de datos compartidos)
```

**Reglas E2E aprendidas** (críticas):

- **Sin `Background`** en los `.feature` (bug de playwright-bdd@8.5.1 con workers) — login+navegación repetidos por escenario.
- **Aislamiento de datos**: los escenarios que mutan datos (crear cuentas/transacciones) usan usuarios/names únicos con timestamp (`e2e/helpers/unique.ts` + localStorage) y NO tocan los datos seed de otros escenarios (p. ej. el usuario de transacciones tiene exactamente 20 transacciones — los escenarios de paginación dependen de eso).
- **Top layer del `<dialog>`**: los toasts (`ToastViewport`, `z-[100]`) quedan ocultos debajo de un dialog abierto — las aserciones se adaptan (error inline dentro del dialog, o modal que se cierra para que el toast sea visible).
- Si la suite completa revela contaminación entre features, el escenario culpable se hace autocontenido (cuenta propia + siembra de datos vía `e2e/helpers/db.ts`).

---

## 5. Fase 4 — Calidad (SonarQube)

```powershell
npm run sonar:check                       # SonarQube arriba? (http://localhost:9000)
npm run sonar                             # análisis (requiere $env:SONAR_TOKEN)
```

El Tech Lead consulta el quality gate vía MCP de SonarQube:

- `sonarqube_get_project_quality_gate_status` — coverage ≥ 70%, new_violations = 0
- `sonarqube_search_sonar_issues_in_projects` — lista las violaciones nuevas (S1874 Zod deprecated, S3776 complejidad, S5906 asserts, S7772 node:crypto, ...)

Cada violación se asigna al subagente dueño del archivo con el fix exacto. **El CI es el juez final** — a veces solo falla en CI (cold starts, carreras de DB test entre archivos en paralelo, puerto 3000 ocupado por procesos huérfanos).

---

## 6. Fase 5 — Commit, Push y CI

1. **Commit en partes lógicas** (backend y frontend separados cuando el cambio es grande), con mensaje convencional:

```powershell
git add <archivos>
git commit -m "feat(scope): summary" -m "- bullet points de cambios"
```

> Los hooks de husky ejecutan lint-staged (eslint + prettier) sobre los archivos staged.

2. **Push** y monitoreo del CI (runner self-hosted en la máquina del desarrollador):

```powershell
git push origin dev
gh run list --branch dev --limit 1 --json databaseId --jq '.[0].databaseId'
gh run watch <run-id> --exit-status --interval 30
gh run view <run-id> --log-failed     # si falla
```

3. **Problemas recurrentes del CI y sus fixes**:

   | Síntoma                          | Causa                                                                                           | Fix                                                                        |
   | -------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
   | `localhost:3000 is already used` | `next start`/`npm run dev` huérfano en el runner                                                | `Stop-Process` del proceso en el puerto 3000, `gh run rerun <id> --failed` |
   | `Test timed out in 5000ms`       | cold start de imports dinámicos pesados en CI                                                   | imports estáticos al top + `testTimeout: 15_000` en vitest.config          |
   | Carreras de DB test              | archivos de integración en paralelo que comparten datos (borran categorías de sistema globales) | cleanups filtrados por userId propio, nunca datos globales                 |
   | SonarQube quality gate ERROR     | `new_violations > 0` (Zod 4 deprecated, ternarios anidados, FormEvent...)                       | fixes puntuales por agente + re-push                                       |

---

## 7. Comandos Habituales (cheat sheet)

### Verificación de calidad

```powershell
npx tsc --noEmit
npx eslint . --max-warnings=0
npx vitest run --coverage
npm run build
```

### Tests dirigidos

```powershell
npx vitest run <archivo>                  # un archivo de test
npx vitest run src/actions/__tests__/     # todas las suites de actions
npm run test:unit                         # unit (sin integración)
```

### E2E

```powershell
npx bddgen
npx playwright test --grep "Gesti[oó]n de Transacciones" --workers=1
npx playwright test --workers=1           # suite completa
npm run db:reset:e2e                      # reset manual de la DB e2e
```

### Git / CI

```powershell
git status; git diff --stat HEAD
git add -A; git commit -m "..."; git push origin dev
gh run watch <run-id> --exit-status --interval 30
gh run view <run-id> --log-failed
```

### Base de datos

```powershell
npx prisma migrate dev --name <nombre>    # dev
$env:PRISMA_E2E="1"; $env:DATABASE_URL="postgresql://postgres:admin@localhost:5434/financetrackerpro_test"; npx prisma migrate deploy
npx prisma generate
```

---

## 8. Reglas de Cierre

- **Nunca se aprueba sin quality gates verdes** (tsc, eslint, coverage ≥ 70%, sonar BLOCKER/CRITICAL = 0, E2E 100%).
- El reporte final al usuario incluye: workflow ejecutado, quality gates con números, hallazgos resueltos, incidentes del CI, y pendientes documentados.
- Los hallazgos menores no bloqueantes se registran en el reporte (no se "esconden").
- No se hace commit sin instrucción explícita del usuario (o tras aprobación del plan que lo incluye).
