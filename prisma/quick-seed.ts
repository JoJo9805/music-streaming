import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import fs from "node:fs";
import path from "node:path";

const connectionString = process.env.DATABASE_URL ?? "";
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

interface CsvRow {
  track_id: string;
  artists: string;
  album_name: string;
  track_name: string;
  popularity: string;
  duration_ms: string;
  explicit: string;
  danceability: string;
  energy: string;
}

function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        fields.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
  }
  fields.push(current.trim());
  return fields;
}

function parseCsv(filePath: string): CsvRow[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]);
  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = splitCsvLine(lines[i]);
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] ?? "";
    }
    rows.push(row as unknown as CsvRow);
  }
  return rows;
}

function normalize(t: {
  popularity: number;
  durationMs: number;
  explicit: boolean;
  danceability: number;
  energy: number;
}) {
  return {
    popularityNorm: t.popularity / 100,
    durationMsNorm: Math.min(t.durationMs / 600_000, 1),
    explicitNorm: t.explicit ? 1.0 : 0.0,
    danceabilityNorm: t.danceability,
    energyNorm: t.energy,
  };
}

async function main() {
  const csvPath = path.resolve(__dirname, "../data/dataset.csv");

  if (!fs.existsSync(csvPath)) {
    console.error(`CSV not found at ${csvPath}`);
    process.exit(1);
  }

  const rows = parseCsv(csvPath);
  console.log(`Parsed ${rows.length} rows from CSV. Seeding in batches...`);

  const BATCH_SIZE = 500;
  let seeded = 0;
  let skipped = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const creates = [];

    for (const row of batch) {
      if (!row.track_id || !row.track_name) continue;
      const popularity = parseInt(row.popularity, 10) || 0;
      const durationMs = parseInt(row.duration_ms, 10) || 0;
      const explicit = row.explicit === "True";
      const danceability = parseFloat(row.danceability) || 0;
      const energy = parseFloat(row.energy) || 0;
      const norms = normalize({ popularity, durationMs, explicit, danceability, energy });

      creates.push({
        trackId: row.track_id,
        artists: row.artists,
        albumName: row.album_name,
        trackName: row.track_name,
        popularity,
        durationMs,
        explicit,
        danceability,
        energy,
        ...norms,
      });
    }

    try {
      await prisma.track.createMany({
        data: creates,
        skipDuplicates: true,
      });
      seeded += creates.length;
    } catch {
      // fallback to one-by-one for conflict handling
      for (const t of creates) {
        try {
          await prisma.track.upsert({
            where: { trackId: t.trackId },
            update: {
              artists: t.artists,
              albumName: t.albumName,
              trackName: t.trackName,
              popularity: t.popularity,
              durationMs: t.durationMs,
              explicit: t.explicit,
              danceability: t.danceability,
              energy: t.energy,
              popularityNorm: t.popularityNorm,
              durationMsNorm: t.durationMsNorm,
              explicitNorm: t.explicitNorm,
              danceabilityNorm: t.danceabilityNorm,
              energyNorm: t.energyNorm,
            },
            create: t,
          });
        } catch {
          skipped++;
        }
      }
    }

    if ((i / BATCH_SIZE) % 5 === 0) {
      console.log(`  ${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length} rows processed...`);
    }
  }

  const count = await prisma.track.count();
  console.log(`\nDone! ${count} tracks in database (${skipped} skipped).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
