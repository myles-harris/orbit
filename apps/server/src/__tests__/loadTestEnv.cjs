// Loaded via setupFiles, which runs before any test module is imported.
//
// This ordering is load-bearing. src/app.ts:1 calls dotenv config() with no
// arguments, which loads apps/server/.env — the file that holds real
// credentials. dotenv does not override variables that are already set, so
// getting .env.test in first is what stops app.ts from pointing the suite at
// whatever .env contains.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env.test') });