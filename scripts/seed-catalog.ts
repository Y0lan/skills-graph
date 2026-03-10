/**
 * CLI script to seed the catalog tables from skill-catalog-full.json.
 * Usage: npm run seed
 */
import { initDatabase, getDb } from '../server/lib/db.js'
import { seedCatalog } from '../server/lib/seed-catalog.js'

initDatabase()
const db = getDb()

// Clear existing catalog data and re-seed
db.exec(`
  DELETE FROM skill_descriptors;
  DELETE FROM calibration_prompts;
  DELETE FROM skills;
  DELETE FROM categories;
  DELETE FROM rating_scale;
`)

seedCatalog(db)
console.log('Catalog seed complete.')
