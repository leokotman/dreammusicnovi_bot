/**
 * One-time script: read saved content from Vercel Blob, convert legacy keys
 * (mainSectionLabels, customMainSections, customMainSectionOrder, hiddenMainSectionIds)
 * to unified shape (sections, sectionOrder, hiddenSectionIds, deletedSections), write back.
 *
 * Run once after deploying the unified-sections refactor, so your Blob has the new shape.
 *
 * Usage:
 *   BLOB_READ_WRITE_TOKEN=<your-token> npx ts-node scripts/migrate-blob-to-unified-sections.ts
 * Or put BLOB_READ_WRITE_TOKEN in .env and run:
 *   npx ts-node scripts/migrate-blob-to-unified-sections.ts
 */
import "dotenv/config";
import { loadSavedContent, saveSavedContent } from "../src/storage";
import { migrateToUnifiedSections } from "../src/content/loader";

async function main(): Promise<void> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error("Set BLOB_READ_WRITE_TOKEN in env (e.g. .env) and run again.");
    process.exit(1);
  }
  const data = await loadSavedContent();
  const migrated = migrateToUnifiedSections(data ?? {});
  await saveSavedContent(migrated);
  console.log("Done. Blob now uses unified sections (sections, sectionOrder, hiddenSectionIds, deletedSections). Legacy keys removed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
