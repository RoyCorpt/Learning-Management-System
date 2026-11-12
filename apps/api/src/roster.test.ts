import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { parseStudentRosterCsv, RosterCsvError } from './roster.js';

const header = ';;;;nim;nama;email;status';
const csv = (rows: string[]) => `${header}\n${rows.join('\n')}\n`;
const domains = ['unimed.ac.id', 'mhs.unimed.ac.id'];

describe('Student roster CSV validation', () => {
  it('maps the observed semicolon CSV shape and layak status to eligibility', () => {
    const result = parseStudentRosterCsv(csv([';;;;0001234567;Mahasiswa Contoh;contoh@mhs.unimed.ac.id;layak']), domains);
    expect(result).toEqual([{ nim: '0001234567', fullName: 'Mahasiswa Contoh', email: 'contoh@mhs.unimed.ac.id', registrationEligible: true }]);
  });

  it('rejects an unexpected header', () => {
    expect(() => parseStudentRosterCsv('nim;nama;email\n1;Nama;contoh@unimed.ac.id', domains)).toThrowError(RosterCsvError);
  });

  it('rejects a missing required value', () => {
    expect(() => parseStudentRosterCsv(csv([';;;;;Nama;contoh@unimed.ac.id;layak']), domains)).toThrowError(/Kolom nim/);
  });

  it('rejects duplicate NIMs and duplicate emails', () => {
    const duplicateNim = csv([';;;;0001234567;Nama Satu;one@mhs.unimed.ac.id;layak', ';;;;0001234567;Nama Dua;two@mhs.unimed.ac.id;layak']);
    const duplicateEmail = csv([';;;;0001234567;Nama Satu;one@mhs.unimed.ac.id;layak', ';;;;0001234568;Nama Dua;one@mhs.unimed.ac.id;layak']);
    expect(() => parseStudentRosterCsv(duplicateNim, domains)).toThrowError(/duplikat/);
    expect(() => parseStudentRosterCsv(duplicateEmail, domains)).toThrowError(/duplikat/);
  });

  it('rejects unknown statuses and domains outside the allowlist', () => {
    expect(() => parseStudentRosterCsv(csv([';;;;0001234567;Nama;one@mhs.unimed.ac.id;tidak diketahui']), domains)).toThrowError(/status roster tidak dikenal/);
    expect(() => parseStudentRosterCsv(csv([';;;;0001234567;Nama;one@other.invalid;layak']), domains)).toThrowError(/allowlist/);
  });

  it.skipIf(!process.env.OFFICIAL_ROSTER_CSV_PATH)('parses the owner-supplied roster file without exposing its rows', async () => {
    const source = await readFile(process.env.OFFICIAL_ROSTER_CSV_PATH!, 'utf8');
    const entries = parseStudentRosterCsv(source, domains);
    expect(entries).toHaveLength(3);
    expect(entries.every((entry) => entry.registrationEligible)).toBe(true);
    expect(new Set(entries.map((entry) => entry.nim)).size).toBe(entries.length);
    expect(new Set(entries.map((entry) => entry.email)).size).toBe(entries.length);
  });
});
