const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../config/env');

class Database {
  constructor(dbPath = config.dbPath, backupDir = config.backupDir) {
    this.dbPath = dbPath;
    this.backupDir = backupDir;
    this.init();
  }

  init() {
    try {
      const dbDir = path.dirname(this.dbPath);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }
      if (!fs.existsSync(this.dbPath)) {
        fs.writeFileSync(this.dbPath, JSON.stringify([], null, 2), 'utf8');
      }
      if (!fs.existsSync(this.backupDir)) {
        fs.mkdirSync(this.backupDir, { recursive: true });
      }
    } catch (err) {
      console.warn('DB init note: ', err.message);
    }
  }


  readSubmissions() {
    try {
      if (!fs.existsSync(this.dbPath)) return [];
      const data = fs.readFileSync(this.dbPath, 'utf8');
      return JSON.parse(data || '[]');
    } catch (err) {
      return [];
    }
  }

  saveSubmission(record) {
    const submissions = this.readSubmissions();
    const newRecord = {
      id: crypto.randomUUID ? crypto.randomUUID() : 'sub_' + Date.now() + '_' + Math.random().toString(36).substring(3, 9),
      timestamp: new Date().toISOString(),
      status: 'New',
      firstName: (record.firstName || '').trim(),
      lastName: (record.lastName || '').trim(),
      email: (record.email || '').toLowerCase().trim(),
      phone: (record.phone || '').trim(),
      description: (record.description || '').trim(),
      clientIp: record.clientIp || '127.0.0.1'
    };

    submissions.push(newRecord);

    try {
      const tempPath = this.dbPath + '.tmp_' + Date.now();
      fs.writeFileSync(tempPath, JSON.stringify(submissions, null, 2), 'utf8');
      fs.renameSync(tempPath, this.dbPath);
      this.createBackupSnapshot();
    } catch (err) {
      console.warn('Storage write note: ', err.message);
    }

    return newRecord;
  }

  createBackupSnapshot() {
    try {
      if (!fs.existsSync(this.dbPath)) return;
      const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const backupFile = path.join(this.backupDir, 'submissions_backup_' + dateStr + '.json');
      fs.copyFileSync(this.dbPath, backupFile);

      const files = fs.readdirSync(this.backupDir)
        .filter(f => f.startsWith('submissions_backup_') && f.endsWith('.json'))
        .sort();

      while (files.length > 10) {
        const oldest = files.shift();
        fs.unlinkSync(path.join(this.backupDir, oldest));
      }
    } catch (err) {}
  }
}

module.exports = new Database();
