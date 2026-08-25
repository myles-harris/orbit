// Must have no imports besides 'dotenv' and must be the first thing index.ts
// imports. ES module imports are hoisted and evaluated in declaration order
// ahead of the importing module's own statements, so a `config()` call placed
// as a sibling statement next to other imports runs too late — every import
// ahead of it, including ones that read process.env at module-eval time,
// would already have evaluated against an empty environment. Verified against
// Node's actual ESM evaluation order (not assumed from CommonJS habits).
import { config } from 'dotenv';
config();
