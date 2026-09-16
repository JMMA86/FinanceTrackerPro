# Agent System - FinanceTrackerPro

Este documento define la arquitectura de agentes del proyecto, sus roles, responsabilidades y cómo interactúan entre sí.

---

## Arquitectura del Sistema

El sistema sigue un modelo de **orquestación jerárquica**: existe un único agente primario (`tech-lead`) que recibe todas las tareas del usuario, decide el flujo de trabajo y delega a subagentes especializados. Los subagentes no interactúan directamente con el usuario.

```
Usuario
  └── tech-lead (PRIMARIO — orquestador)
        ├── dev-backend    (subagente — implementación)
        ├── dev-frontend   (subagente — implementación)
        ├── dev-tester     (subagente — testing unitario/integración)
        ├── dev-e2e        (subagente — testing E2E Playwright + Cucumber)
        ├── qa-lead        (subagente — auditoría)
        ├── sec-ops        (subagente — seguridad)
        └── audit-finance  (subagente — integridad financiera)
```

---

## Agente Primario

### tech-lead (Tech Lead — Orquestador)

**Modo**: `primary` — único punto de entrada del sistema.

**Responsabilidades**:

- Analizar cada tarea y determinar qué subagentes invocar y en qué orden
- Proveer briefings estructurados a cada subagente (contexto, alcance, restricciones, entregable)
- Validar los resultados de cada subagente antes de pasar al siguiente
- Garantizar que los quality gates se cumplan antes de cerrar cualquier ciclo
- Consolidar reportes de `qa-lead`, `sec-ops` y `audit-finance` en un resumen ejecutivo para el usuario
- Gestionar bloqueos y reasignar trabajo cuando un subagente falla o QA rechaza

**Workflows que conoce**:

| Tipo de tarea          | Secuencia de subagentes                                               |
| ---------------------- | --------------------------------------------------------------------- |
| Feature full-stack     | `dev-backend` → `dev-frontend` → `dev-tester` → `dev-e2e` → `qa-lead` |
| Feature solo backend   | `dev-backend` → `dev-tester` → `qa-lead`                              |
| Feature solo frontend  | `dev-frontend` → `dev-tester` → `dev-e2e` → `qa-lead`                 |
| Bug fix                | `dev-backend` y/o `dev-frontend` → `dev-tester` → `qa-lead`           |
| Auditoría de seguridad | `sec-ops` → `dev-backend` → `qa-lead`                                 |
| Auditoría financiera   | `audit-finance` → `dev-backend` → `dev-tester` → `qa-lead`            |
| Review de PR           | `qa-lead` → `dev-e2e` → `sec-ops`_ → `audit-finance`_                 |

> \* Solo si el PR toca auth/pagos o cálculos monetarios respectivamente.

**Ubicación**: `.opencode/agents/tech-lead/prompt.md`

---

## Subagentes Especializados

### 1. dev-backend (Desarrollador Backend Senior)

**Modo**: `subagent`

**Responsabilidades**:

- Implementar Server Actions en `src/actions/*.ts`
- Operaciones de base de datos con Prisma
- Transacciones atómicas (ACID) con `prisma.$transaction()`
- Validación server-side con Zod
- Seguridad: Argon2id hashing, timing-safe comparisons
- Cálculos financieros con Decimal.js en `src/lib/money.ts`
- Migraciones de base de datos con Prisma Migrate

**Tech Stack**:

- Node.js 20+, Next.js 15+ (Server Actions, Route Handlers)
- PostgreSQL 16+ con Prisma ORM
- Zod schemas, Decimal.js

**Ubicación**: `.opencode/agents/dev-backend/prompt.md`

---

### 2. dev-frontend (Desarrollador Frontend Senior)

**Modo**: `subagent`

**Responsabilidades**:

- UI/UX con Next.js App Router
- Componentes Server (RSC) vs Client — correcta separación de límites
- Accesibilidad WCAG 2.2 AA
- SEO optimization (metadata, sitemap, robots.txt)
- Tailwind CSS v4
- Zustand exclusivamente para estado de UI (sin lógica de negocio)
- React Hook Form + Zod para formularios
- Integración con Server Actions de `dev-backend`

**Tech Stack**:

- Next.js 15+, React 19, TypeScript strict
- Tailwind CSS v4, Zustand
- Vitest + React Testing Library

**Ubicación**: `.opencode/agents/dev-frontend/prompt.md`

---

### 3. dev-tester (SDET — Ingeniero en Pruebas)

**Modo**: `subagent`

**Responsabilidades**:

- Mantener cobertura mínima del 70% (líneas, ramas, funciones, sentencias)
- Tests unitarios para cálculos financieros (`src/lib/money.ts`)
- Tests de integración para Server Actions (rollback, idempotencia, atomicidad)
- Tests de componentes (accesibilidad, interacción, estados de error)
- Testing de edge cases en cálculos con Decimal.js

**Comando obligatorio**:

```bash
npm run test:coverage
```

**Patrones de archivos**:

- Tests unitarios: `src/**/__tests__/*.spec.ts`
- Tests de integración: `src/**/__tests__/*.integration.test.ts`

**Ubicación**: `.opencode/agents/dev-tester/prompt.md`

---

### 4. dev-e2e (Ingeniero E2E — Playwright + Cucumber BDD)

**Modo**: `subagent`

**Responsabilidades**:

- Tests E2E de flujos críticos de usuario en navegadores reales (Chromium, Firefox, WebKit, mobile)
- Escribir escenarios en Gherkin (`.feature` files) legibles por todo el equipo
- Implementar step definitions en TypeScript con `playwright-bdd`
- Usar el **MCP de Playwright** para explorar flujos manualmente y convertirlos en tests automatizados (ciclo obligatorio: explorar → anotar en Gherkin → implementar → verificar)
- Garantizar aislamiento de datos usando la base de datos E2E dedicada (`financetracker-postgres-e2e`, puerto 5433, vía `.env.e2e`) — nunca la base de datos de desarrollo
- Detectar regresiones visuales, problemas de navegación y errores de servidor no capturados por tests unitarios

**Regla de Oro**:

Cada flujo explorado con el MCP **debe** producir un `.feature` file + step definitions antes de cerrar la tarea.

**Tech Stack**:

- Playwright + `playwright-bdd` + Cucumber / Gherkin
- Base de datos PostgreSQL aislada (`financetracker-postgres-e2e` en puerto 5433 vía `.env.e2e`)
- Chromium, Firefox, WebKit, Pixel 7 (mobile)

**Comandos obligatorios**:

```bash
npm run db:reset:e2e     # Limpiar schema e2e antes de la suite
npx bddgen               # Generar tests desde .feature files
npx playwright test      # Ejecutar suite E2E
npx playwright show-report
```

**Estructura de archivos**:

- Features: `e2e/features/*.feature`
- Steps: `e2e/steps/*.steps.ts`
- Helpers: `e2e/helpers/auth.ts`

**Ubicación**: `.opencode/agents/dev-e2e/prompt.md`

---

### 5. qa-lead (QA Lead — Auditor de Calidad)

**Modo**: `subagent` | `edit: deny`

**Responsabilidades**:

- Auditar todos los cambios contra las 14 reglas de integridad financiera de `CLAUDE.md`
- Verificar seguridad backend (Argon2, timing-safe, errores genéricos)
- Validar accesibilidad WCAG 2.2 AA en componentes UI
- Ejecutar SonarQube y validar quality gates globales
- Generar reportes de auditoría con hallazgos categorizados por severidad
- Asignar correcciones a los subagentes correspondientes

**14 Reglas de Integridad Financiera** (de `CLAUDE.md`):

1. Decimal.js precision — todos los cálculos financieros
2. Integer storage — montos como centavos en DB
3. Banker's rounding — ROUND_HALF_EVEN
4. Currency codes — ISO 4217 obligatorio
5. Atomic transactions — `prisma.$transaction()`
6. Soft deletes — `isActive: false`, nunca DELETE físico
7. Audit trail — `createdBy`, `lastModifiedBy`, `ipAddress`, `userAgent`
8. Server-side validation — Zod en Server Actions
9. Currency traceability — `originalAmountCents`, `exchangeRate`
10. Idempotency — UUID v4 en transacciones y transferencias
11. Source of truth — reconciliación desde historial de transacciones
12. TypeScript strictness — sin tipos `any`
13. Database constraints — CHECK, ON DELETE RESTRICT
14. Security logging — rate limiting, MFA, cifrado en reposo

**Checks obligatorios**:

```bash
npm run type-check    # TypeScript — exit code 0
npm run lint          # ESLint — exit code 0
npm run test:coverage # Cobertura ≥ 70%
npm run sonar         # BLOCKER/CRITICAL = 0
```

**Ubicación**: `.opencode/agents/qa-lead/prompt.md`

---

### 6. sec-ops (Líder de Ciberseguridad y SecOps)

**Modo**: `subagent` | `edit: deny`

**Responsabilidades**:

- Auditoría OWASP Top 10 (2021)
- Protección de datos PII (cifrado, enmascaramiento en logs)
- Implementación y verificación de rate limiting
- Validación de input (defensa en profundidad)
- Gestión segura de sesiones (httpOnly, secure, sameSite)
- Security headers (CSP, X-Frame-Options, HSTS)
- Auditoría de dependencias

**OWASP Top 10 auditados**:

- A01: Broken Access Control
- A02: Cryptographic Failures
- A03: Injection (SQL, XSS, Command)
- A04: Insecure Design
- A05: Security Misconfiguration
- A06: Vulnerable and Outdated Components
- A07: Identification and Authentication Failures
- A08: Software and Data Integrity Failures
- A09: Security Logging and Monitoring Failures
- A10: Server-Side Request Forgery (SSRF)

**Comandos de auditoría**:

```bash
npm audit --audit-level=high
npm outdated
npm run lint
```

**Ubicación**: `.opencode/agents/sec-ops/prompt.md`

---

### 7. audit-finance (Auditor de Integridad Financiera)

**Modo**: `subagent` | `edit: deny` | `bash: false`

**Responsabilidades**:

- Verificar uso exclusivo de Decimal.js en cálculos monetarios
- Detectar fugas de precisión IEEE 754 (uso de `float`/`number` nativo)
- Auditar integridad del ledger (libro mayor): sin asientos duplicados
- Validar trazabilidad de divisas (`originalAmountCents`, `exchangeRate` inmutable)
- Verificar idempotencia en transacciones y transferencias
- Auditar campos de soft delete y trail de auditoría
- **No modifica código** — genera exclusivamente reportes de hallazgos

**Severidades del reporte**:

| Nivel     | Descripción                                           |
| --------- | ----------------------------------------------------- |
| `CRÍTICO` | Bloquea PR — impacto directo en integridad financiera |
| `MAYOR`   | Requiere corrección antes del merge                   |
| `MENOR`   | Mejora recomendada, no bloqueante                     |
| `OK`      | Regla verificada y cumplida                           |

**Ubicación**: `.opencode/agents/audit-finance/prompt.md`

---

## Skills Instalados

Los skills están en `.opencode/skills/` y contienen guías de referencia técnica para los subagentes:

| Skill                       | Descripción                                  |
| --------------------------- | -------------------------------------------- |
| `accessibility`             | WCAG 2.2 patrones de accesibilidad           |
| `composition-patterns`      | React composition, component API design      |
| `frontend-design`           | UI de producción grado                       |
| `next-best-practices`       | File conventions, RSC boundaries, async APIs |
| `next-cache-components`     | PPR, use cache directive, cacheTag           |
| `next-upgrade`              | Guía de migración Next.js                    |
| `nodejs-backend-patterns`   | Express/Fastify patterns, middleware, auth   |
| `nodejs-best-practices`     | Framework selection, async patterns          |
| `prisma-cli`                | Comandos Prisma CLI                          |
| `prisma-client-api`         | Query patterns, filters, operators           |
| `prisma-database-setup`     | Database configuration, migrations           |
| `prisma-postgres`           | Prisma Postgres setup                        |
| `react-best-practices`      | Performance patterns, re-render prevention   |
| `seo`                       | Meta tags, structured data, sitemap          |
| `tailwind-css-patterns`     | Utility-first styling, responsive design     |
| `typescript-advanced-types` | Type safety, branded types                   |
| `zod`                       | Schema validation patterns                   |

---

## Flujos de Trabajo

Todos los flujos son iniciados y coordinados por `tech-lead`. Los subagentes no se invocan directamente.

### Desarrollo de Features (Full-Stack)

```
tech-lead
  ├── 1. dev-backend   → Server Actions + schema Prisma + validación Zod
  │         ↓ (si toca cálculos monetarios)
  │   audit-finance   → Reporte de integridad (solo lectura)
  ├── 2. dev-frontend  → UI + integración de Actions + accesibilidad
  ├── 3. dev-tester    → Tests unitarios + integración (coverage ≥ 70%)
  │         ↓ (si toca auth/pagos)
  │   sec-ops         → Auditoría OWASP (solo lectura)
  ├── 4. dev-e2e       → Escenarios Gherkin + tests Playwright de los flujos afectados
  └── 5. qa-lead       → Auditoría 14 reglas + quality gates
```

### Revisión de Seguridad

```
tech-lead
  ├── 1. sec-ops      → Reporte OWASP Top 10
  ├── 2. dev-backend  → Correcciones asignadas
  └── 3. qa-lead      → Validación final de quality gates
```

### Auditoría de Integridad Financiera

```
tech-lead
  ├── 1. audit-finance → Reporte de hallazgos (sin tocar código)
  ├── 2. dev-backend   → Correcciones de lógica financiera
  ├── 3. dev-tester    → Tests de los casos corregidos
  └── 4. qa-lead       → Quality gate final
```

### Review de PR Antes de Merge

```
tech-lead
  ├── 1. qa-lead        → Auditoría completa (14 reglas + sonar)
  ├── 2. dev-e2e        → Suite E2E completa en los flujos afectados
  ├── 3. sec-ops*       → Si hay cambios en auth/pagos/datos sensibles
  └── 4. audit-finance* → Si hay cambios en cálculos monetarios/transferencias
```

### Quality Gate — Criterios de Aprobación

Ningún PR se aprueba sin que `qa-lead` confirme:

| Check                   | Criterio               |
| ----------------------- | ---------------------- |
| `npm run type-check`    | Exit code 0            |
| `npm run lint`          | Exit code 0            |
| `npm run test:coverage` | Cobertura ≥ 70%        |
| `npx playwright test`   | 100% en Chromium       |
| `npm run sonar`         | BLOCKER y CRITICAL = 0 |

---

## Referencias

- **CLAUDE.md**: 14 Financial Integrity Rules + Banking-Grade Integrity Pillars
- **DATABASE.md**: Arquitectura de base de datos
- **README.md**: Setup y scripts del proyecto
- `.opencode/agents/tech-lead/prompt.md`: Orquestador principal — leer para entender el sistema completo
- `.opencode/agents/*/prompt.md`: Prompts completos de cada subagente
- `.opencode/skills/*/SKILL.md`: Guías de referencia técnica por dominio
