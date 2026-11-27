import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { run, query, get } from '../database/db.js';
import { sha256 } from '../security/cryptoUtils.js';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backupsDir = path.resolve(__dirname, '../../../data/backups');

export class BackupService {
  constructor() {
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true });
    }
  }

  /**
   * Performs an atomic online SQLite hot backup via VACUUM INTO
   */
  async createHotBackup() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `nova-backup-${timestamp}.sqlite`;
    const targetPath = path.join(backupsDir, filename);

    // Escape backslashes for SQLite path string literal on Windows
    const sqliteSafePath = targetPath.replace(/\\/g, '/');

    // Execute SQLite VACUUM INTO (supported in modern SQLite 3.27+)
    await run(`VACUUM INTO '${sqliteSafePath}'`);

    const stats = fs.statSync(targetPath);
    const fileBuffer = fs.readFileSync(targetPath);
    const checksum = sha256(fileBuffer);
    const backupId = `bkp-${uuidv4().substring(0, 8)}`;
    const now = new Date().toISOString();

    await run(
      `INSERT INTO backups_meta 
      (id, filename, filepath, filesize, checksum, verification_status, created_at) 
      VALUES (?, ?, ?, ?, ?, 'unverified', ?)`,
      [backupId, filename, targetPath, stats.size, checksum, now]
    );

    return {
      id: backupId,
      filename,
      filepath: targetPath,
      filesize: stats.size,
      checksum,
      verification_status: 'unverified',
      created_at: now
    };
  }

  /**
   * Verifies the database integrity of a backup snapshot by mounting it and running PRAGMA integrity_check
   */
  async verifyBackup(backupId) {
    const meta = await get('SELECT * FROM backups_meta WHERE id = ?', [backupId]);
    if (!meta) throw new Error('Backup metadata not found');

    if (!fs.existsSync(meta.filepath)) {
      await run("UPDATE backups_meta SET verification_status = 'file_missing' WHERE id = ?", [backupId]);
      throw new Error('Backup file does not exist on disk');
    }

    // Verify SHA-256 checksum first
    const currentBuffer = fs.readFileSync(meta.filepath);
    const currentChecksum = sha256(currentBuffer);
    if (currentChecksum !== meta.checksum) {
      await run("UPDATE backups_meta SET verification_status = 'checksum_mismatch' WHERE id = ?", [backupId]);
      return { verified: false, error: 'Checksum mismatch: backup file altered or corrupt' };
    }

    // Open isolated connection to check integrity
    const testDb = new sqlite3.Database(meta.filepath, sqlite3.OPEN_READONLY);

    const checkPromise = new Promise((resolve, reject) => {
      testDb.get('PRAGMA integrity_check;', (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    try {
      const row = await checkPromise;
      const isOk = row && row.integrity_check === 'ok';
      const status = isOk ? 'verified' : 'corrupt';

      await run('UPDATE backups_meta SET verification_status = ? WHERE id = ?', [status, backupId]);
      testDb.close();

      return {
        verified: isOk,
        status,
        checksum: currentChecksum,
        filesize: meta.filesize,
        integrityOutput: isOk ? 'ok' : 'corrupt'
      };
    } catch (dbErr) {
      testDb.close();
      await run("UPDATE backups_meta SET verification_status = 'corrupt' WHERE id = ?", [backupId]);
      return { verified: false, error: dbErr.message, integrityOutput: 'error' };
    }
  }

  /**
   * Alias for verifyBackup
   */
  async verifyBackupIntegrity(backupId) {
    return this.verifyBackup(backupId);
  }

  /**
   * Retrieves all backup records
   */
  async listBackups() {
    return query('SELECT * FROM backups_meta ORDER BY created_at DESC');
  }

  /**
   * Deletes a backup from disk and registry
   */
  async deleteBackup(backupId) {
    const meta = await get('SELECT * FROM backups_meta WHERE id = ?', [backupId]);
    if (!meta) throw new Error('Backup metadata not found');

    if (fs.existsSync(meta.filepath)) {
      try {
        fs.unlinkSync(meta.filepath);
      } catch (err) {
        console.warn('[BackupService] Failed unlinking backup file:', err.message);
      }
    }

    const res = await run('DELETE FROM backups_meta WHERE id = ?', [backupId]);
    return res.changes > 0;
  }
}

export default new BackupService();
