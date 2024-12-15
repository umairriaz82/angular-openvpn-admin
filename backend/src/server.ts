const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const port = 3000;

app.use(bodyParser.json());
const db = new sqlite3.Database('./openvpn-admin.db');

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      bytes_received INTEGER DEFAULT 0,
      bytes_sent INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active',
      last_login TEXT
    )
  `);
});

app.get('/api/clients', (req, res) => {
  db.all('SELECT * FROM clients', [], (err, rows) => {
    if (err) res.status(500).json({ error: err.message });
    else res.json(rows);
  });
});

app.post('/api/clients', (req, res) => {
  const { name } = req.body;
  db.run('INSERT INTO clients (name) VALUES (?)', [name], function (err) {
    if (err) res.status(500).json({ error: err.message });
    else res.json({ id: this.lastID });
  });
});

app.delete('/api/clients/:id', (req, res) => {
  db.run('DELETE FROM clients WHERE id = ?', [req.params.id], function (err) {
    if (err) res.status(500).json({ error: err.message });
    else res.json({ deleted: this.changes });
  });
});

app.get('/api/stats', (req, res) => {
  db.get(
    'SELECT SUM(bytes_received) AS bytesReceived, SUM(bytes_sent) AS bytesSent FROM clients',
    [],
    (err, row) => {
      if (err) res.status(500).json({ error: err.message });
      else res.json(row);
    }
  );
});

app.listen(port, () => {
  console.log(`Backend running at http://localhost:${port}`);
});
