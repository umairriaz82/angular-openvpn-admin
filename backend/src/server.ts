import express from 'express';
import cors from 'cors';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import jwt from 'jsonwebtoken';

const execAsync = promisify(exec);
const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from the correct dist path
app.use(express.static(path.join(__dirname, '../dist/browser')));

// Database initialization
const initializeDatabase = async () => {
    const db = await open({
        filename: 'vpn.db',
        driver: sqlite3.Database
    });

    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS vpn_clients (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_connected DATETIME,
            bytes_received INTEGER DEFAULT 0,
            bytes_sent INTEGER DEFAULT 0,
            status TEXT DEFAULT 'disconnected'
        );
    `);

    // Insert default admin user if not exists
    const adminExists = await db.get('SELECT * FROM users WHERE username = ?', 'admin');
    if (!adminExists) {
        await db.run('INSERT INTO users (username, password) VALUES (?, ?)', 'admin', 'admin123');
    }

    return db;
};

// Initialize database and start server
(async () => {
    const db = await initializeDatabase();
    
    // JWT Secret
    const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

    // Authentication middleware
    const authenticateToken = (req: any, res: any, next: any) => {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) return res.sendStatus(401);

        jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
            if (err) return res.sendStatus(403);
            req.user = user;
            next();
        });
    };

    // Routes
    app.post('/api/login', async (req, res) => {
        const { username, password } = req.body;
        const user = await db.get('SELECT * FROM users WHERE username = ?', username);

        if (!user || user.password !== password) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const token = jwt.sign({ username }, JWT_SECRET);
        res.json({ token });
    });

    // VPN Client Management Routes
    app.post('/api/clients', authenticateToken, async (req, res) => {
        try {
            const { name } = req.body;
            await execAsync(`cd /etc/openvpn/easy-rsa && ./easyrsa build-client-full ${name} nopass`);
            await db.run('INSERT INTO vpn_clients (name) VALUES (?)', name);
            res.json({ message: 'Client created successfully' });
        } catch (error) {
            res.status(500).json({ error: 'Failed to create client' });
        }
    });

    app.delete('/api/clients/:name', authenticateToken, async (req, res) => {
        try {
            const { name } = req.params;
            await execAsync(`cd /etc/openvpn/easy-rsa && ./easyrsa revoke ${name}`);
            await db.run('DELETE FROM vpn_clients WHERE name = ?', name);
            res.json({ message: 'Client deleted successfully' });
        } catch (error) {
            res.status(500).json({ error: 'Failed to delete client' });
        }
    });

    app.get('/api/clients', authenticateToken, async (req, res) => {
        try {
            const clients = await db.all('SELECT * FROM vpn_clients');
            res.json(clients);
        } catch (error) {
            res.status(500).json({ error: 'Failed to fetch clients' });
        }
    });

    // Serve Angular app for all other routes
    app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, '../dist/browser/index.html'));
    });

    // Start server
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
})();