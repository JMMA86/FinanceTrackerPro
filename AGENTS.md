# Agent System - FinanceTrackerPro

Este documento define los agentes especializados disponibles en el proyecto y cómo interactuar con ellos.

## Agentes Disponibles

### 1. dev-backend (Senior Backend Developer)

**Responsabilidades**:

- Implementar Server Actions en `src/actions/*.ts`
- Operaciones de base de datos con Prisma
- Transacciones atómicas (ACID)
- Validación con Zod
- Seguridad: Argon2id hashing, timing-safe comparisons
- Cálculos financieros con Decimal.js

**Tech Stack**:

- Node.js 20+, Next.js 15+ (Server Actions, Route Handlers)
- PostgreSQL 16+ con Prisma ORM
- Zod schemas, Decimal.js

**Ubicación**: `.opencode/agents/dev-backend/prompt.md`

---

### 2. dev-frontend (Senior Frontend Developer)

**Responsabilidades**:

- UI/UX con Next.js App Router
- Componentes Server (RSC) vs Client
- Accesibilidad WCAG 2.2 AA
- SEO optimization (metadata, sitemap)
- Tailwind CSS v4
- Zustand (estado UI, sin lógica de negocio)
- React Hook Form + Zod

**Tech Stack**:

- Next.js 15+, React 19, TypeScript strict
- Tailwind CSS v4, Zustand
- Vitest + React Testing Library

**Ubicación**: `.opencode/agents/dev-frontend/prompt.md`

---

### 3. dev-tester (SDET - Software Development Engineer in Test)

**Responsabilidades**:

- Mantener coverage mínimo 80%
- Tests unitarios, integración, E2E
- Testing de edge cases en cálculos financieros
- Mock de servicios externos

**Comandos obligatorios**:

```bash
npm run test:coverage
```

**Ubicación**: `.opencode/agents/dev-tester/prompt.md`

---

### 4. qa-lead (QA Lead)

**Responsabilidades**:

- Auditar todos los cambios contra reglas de integridad financiera (14 reglas de CLAUDE.md)
- Verificar seguridad backend
- Validar accesibilidad WCAG 2.2 AA
- Cumplimiento de skills instalados
- Code review checklist
- Ejecutar SonarQube y validar quality gates

**14 Reglas de Integridad Financiera** (de CLAUDE.md):

1. Decimal.js precision - todos los cálculos financieros
2. Integer storage - montos como centavos
3. Banker's rounding - ROUND_HALF_EVEN
4. Currency codes - ISO 4217
5. Atomic transactions - prisma.$transaction()
6. Soft deletes - isActive: false
7. Audit trail - createdBy, lastModifiedBy, ipAddress, userAgent
8. Server-side validation - Zod en Server Actions
9. Currency traceability - originalAmountCents, exchangeRate
10. Idempotency - UUID v4
11. Source of truth - reconciliation desde transacciones
12. TypeScript strictness - NO any
13. Database constraints - CHECK, ON DELETE RESTRICT
14. Security logging - rate limiting, MFA, encryption

**Checks obligatorios**:

```bash
npm run type-check
npm run lint
npm run test:coverage
npm run sonar
```

**Ubicación**: `.opencode/agents/qa-lead/prompt.md`

---

### 5. sec-ops (Cybersecurity & SecOps Lead)

**Responsabilidades**:

- Auditoría OWASP Top 10 (2021)
- Protección PII
- Rate limiting implementation
- Input validation (defense in depth)
- Secure session management
- Security headers
- Dependency audit

**OWASP Top 10 Auditados**:

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

## Skills Instalados

Los skills están en `.opencode/skills/` y contienen guías especializadas:

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

## Flujo de Trabajo

### Desarrollo de Features

```
1. dev-backend → Implementa Server Actions + DB
2. dev-frontend → Implementa UI + integra Actions
3. dev-tester → Añade tests (coverage ≥ 80%)
4. qa-lead → Audita cambios (type-check, lint, test, sonar)
5. sec-ops → Revisión seguridad si es necesario
```

### Revisión de Seguridad

```
1. sec-ops → Ejecuta auditoría OWASP
2. Genera Security Audit Report
3. qa-lead → Valida que issues de seguridad se resuelvan
```

### Quality Gate (QA Lead)

Antes de aprobar PR:

- `npm run type-check` → Exit code 0
- `npm run lint` → Exit code 0
- `npm run test:coverage` → Coverage ≥ 80%
- `npm run sonar:full` → BLOCKER/CRITICAL = 0

---

## Referencias

- **CLAUDE.md**: 14 Financial Integrity Rules
- **DATABASE.md**: Arquitectura de base de datos
- **README.md**: Setup y scripts del proyecto
- `.opencode/agents/*/prompt.md`: Prompts completos de cada agente
- `.opencode/skills/*/SKILL.md`: Guías de skills específicos
