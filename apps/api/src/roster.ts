import { parse } from 'csv-parse/sync';
import { z } from 'zod';

export type StudentRosterCsvEntry = { nim: string; fullName: string; email: string; registrationEligible: true };

export class RosterCsvError extends Error {
  constructor(readonly code: string, message: string, readonly row?: number) {
    super(message);
    this.name = 'RosterCsvError';
  }
}

const valuesSchema = z.object({
  nim: z.string().trim().min(1).max(30),
  nama: z.string().trim().min(1).max(150),
  email: z.string().trim().email().max(255),
  status: z.string().trim().min(1),
});

const HEADER_NAMES = ['nim', 'nama', 'email', 'status'] as const;

export function parseStudentRosterCsv(csv: string, allowedDomains: string[]): StudentRosterCsvEntry[] {
  if (!csv.trim() || Buffer.byteLength(csv, 'utf8') > 1_000_000) {
    throw new RosterCsvError('ROSTER_CSV_INVALID', 'CSV kosong atau melewati batas ukuran.');
  }

  let rows: string[][];
  try {
    rows = parse(csv, { bom: true, delimiter: ';', skip_empty_lines: true, trim: true, max_record_size: 100_000 }) as string[][];
  } catch {
    throw new RosterCsvError('ROSTER_CSV_INVALID', 'Struktur CSV tidak valid.');
  }
  if (rows.length < 2) throw new RosterCsvError('ROSTER_CSV_HEADER_INVALID', 'CSV harus memiliki header dan sedikitnya satu baris data.');

  const header = rows[0]!.map((value) => value.trim().toLowerCase());
  const firstHeaderColumn = header.findIndex((value) => value !== '');
  if (firstHeaderColumn < 0) throw new RosterCsvError('ROSTER_CSV_HEADER_INVALID', 'Header CSV tidak ditemukan.');
  if (header.slice(0, firstHeaderColumn).some(Boolean)) throw new RosterCsvError('ROSTER_CSV_HEADER_INVALID', 'Kolom kosong di depan header tidak konsisten.');
  const effectiveHeader = header.slice(firstHeaderColumn);
  if (effectiveHeader.length !== HEADER_NAMES.length || new Set(effectiveHeader).size !== HEADER_NAMES.length || HEADER_NAMES.some((name) => !effectiveHeader.includes(name))) {
    throw new RosterCsvError('ROSTER_CSV_HEADER_INVALID', 'Header wajib: nim, nama, email, status.');
  }

  const columns = new Map(effectiveHeader.map((name, index) => [name, firstHeaderColumn + index]));
  const allowed = new Set(allowedDomains.map((domain) => domain.trim().toLowerCase().replace(/^@/, '')).filter(Boolean));
  const nims = new Set<string>();
  const emails = new Set<string>();
  const entries: StudentRosterCsvEntry[] = [];

  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index]!;
    if (row.every((value) => value.trim() === '')) continue;
    const rowNumber = index + 1;
    if (row.length !== header.length || row.slice(0, firstHeaderColumn).some((value) => value.trim() !== '')) {
      throw new RosterCsvError('ROSTER_CSV_ROW_INVALID', 'Jumlah kolom baris tidak konsisten.', rowNumber);
    }
    const raw = Object.fromEntries(HEADER_NAMES.map((name) => [name, row[columns.get(name)!] ?? '']));
    const result = valuesSchema.safeParse(raw);
    if (!result.success) {
      const field = String(result.error.issues[0]?.path[0] ?? 'data');
      throw new RosterCsvError('ROSTER_CSV_ROW_INVALID', `Kolom ${field} wajib valid.`, rowNumber);
    }

    const nim = result.data.nim;
    const fullName = result.data.nama;
    const email = result.data.email.toLowerCase();
    const status = result.data.status.toLowerCase();
    if (status !== 'layak') throw new RosterCsvError('ROSTER_CSV_STATUS_INVALID', 'Nilai status roster tidak dikenal.', rowNumber);
    const domain = email.split('@').at(-1)!;
    if (!allowed.has(domain)) throw new RosterCsvError('ROSTER_CSV_DOMAIN_INVALID', 'Domain email roster tidak termasuk allowlist.', rowNumber);
    const nimKey = nim.toLowerCase();
    if (nims.has(nimKey) || emails.has(email)) throw new RosterCsvError('ROSTER_CSV_DUPLICATE', 'NIM atau email duplikat di dalam CSV.', rowNumber);
    nims.add(nimKey);
    emails.add(email);
    entries.push({ nim, fullName, email, registrationEligible: true });
  }

  if (entries.length === 0) throw new RosterCsvError('ROSTER_CSV_EMPTY', 'CSV tidak memuat baris roster yang valid.');
  return entries;
}
