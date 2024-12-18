import express from 'express';
import cors from 'cors';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import jwt from 'jsonwebtoken';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import { appendFile } from 'fs/promises';
import helmet from 'helmet';

const execAsync = promisify(exec);
const app = express();
const PORT = 3000;
const HOST = '0.0.0.0';

// Middleware
app.use(cors({
    origin: true, // Allow all origins temporarily
    methods: ['GET', 'POST', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

app.use(express.json());

// Serve static files from the correct dist path
app.use(express.static(path.join(__dirname, '../dist/browser'), {
    setHeaders: (res, path) => {
        if (path.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
        }
    }
}));

// Update Helmet configuration to be less restrictive
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'https:', 'http:'],
            connectSrc: ["'self'", 'https:', 'http:', 'ws:', 'wss:'],
            fontSrc: ["'self'", 'data:', 'https:', 'http:'],
            objectSrc: ["'none'"],
            mediaSrc: ["'none'"],
            frameSrc: ["'none'"],
        },
    },
    crossOriginEmbedderPolicy: false, // Disable temporarily
    crossOriginOpenerPolicy: false,   // Disable temporarily
    crossOriginResourcePolicy: { policy: "cross-origin" }, // Allow cross-origin
}));

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

// Add this function to periodically update client status
async function updateClientStatus() {
    try {
        // Read the status log file
        const statusLog = await fs.promises.readFile('/var/log/openvpn/openvpn-status.log', 'utf8');
        console.log('Status log content:', statusLog);

        const lines = statusLog.split('\n');
        const clientStats = new Map();

        // Different possible section markers
        let inClientSection = false;
        let inRoutingSection = false;

        for (const line of lines) {
            // Debug logging
            console.log('Processing line:', line);

            // Check for section headers
            if (line.includes('CLIENT LIST')) {
                inClientSection = true;
                inRoutingSection = false;
                continue;
            } else if (line.includes('ROUTING TABLE')) {
                inClientSection = false;
                inRoutingSection = true;
                continue;
            }

            // Process client list section
            if (inClientSection && line.trim()) {
                const parts = line.split(',').map(part => part.trim());
                
                // Skip header line
                if (parts[0] === 'Common Name') continue;
                
                // Skip UNDEF entries
                if (parts[0] && !parts[0].includes('UNDEF')) {
                    const clientName = parts[0];
                    const bytesReceived = parseInt(parts[2]) || 0;
                    const bytesSent = parseInt(parts[3]) || 0;
                    const connectedSince = parts[4] || new Date().toISOString();

                    console.log('Found connected client:', {
                        name: clientName,
                        bytesReceived,
                        bytesSent,
                        connectedSince
                    });

                    clientStats.set(clientName, {
                        status: 'connected',
                        last_connected: connectedSince,
                        bytes_received: bytesReceived,
                        bytes_sent: bytesSent
                    });
                }
            }
        }

        // Debug log the found clients
        console.log('Found clients:', Array.from(clientStats.entries()));

        const db = await open({
            filename: 'vpn.db',
            driver: sqlite3.Database
        });

        // Get current clients from database
        const currentClients = await db.all('SELECT name, status FROM vpn_clients');
        console.log('Current clients in database:', currentClients);

        // Set all clients to disconnected first
        await db.run(`
            UPDATE vpn_clients 
            SET status = 'disconnected' 
            WHERE status = 'connected'
        `);

        // Update connected clients
        for (const [name, stats] of clientStats.entries()) {
            console.log(`Updating client ${name} with stats:`, stats);
            
            const result = await db.run(`
                UPDATE vpn_clients 
                SET status = ?, 
                    last_connected = ?, 
                    bytes_received = ?, 
                    bytes_sent = ? 
                WHERE name = ?
            `, 
            stats.status,
            stats.last_connected,
            stats.bytes_received,
            stats.bytes_sent,
            name
            );

            console.log(`Update result for ${name}:`, result);
        }

        // Verify the updates
        const updatedClients = await db.all('SELECT * FROM vpn_clients');
        console.log('Updated clients in database:', updatedClients);

    } catch (error: any) {
        console.error('Error updating client status:', error?.message || 'Unknown error');
        console.error('Error details:', {
            name: error?.name,
            code: error?.code,
            stack: error?.stack
        });
    }
}

// Add this logging utility function
async function logToFile(message: string) {
    const timestamp = new Date().toISOString();
    const logMessage = `${timestamp}: ${message}\n`;
    try {
        await appendFile('/var/log/vpn-manager/delete-operations.log', logMessage);
    } catch (error) {
        // If the directory doesn't exist, create it
        await fsPromises.mkdir('/var/log/vpn-manager', { recursive: true });
        await appendFile('/var/log/vpn-manager/delete-operations.log', logMessage);
    }
}

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
        const { name } = req.params;
        await logToFile(`=== Starting deletion process for client: ${name} ===`);

        try {
            // First check if client exists
            const client = await db.get('SELECT * FROM vpn_clients WHERE name = ?', name);
            if (!client) {
                await logToFile(`Client ${name} not found in database`);
                return res.status(404).json({ error: 'Client not found' });
            }
            await logToFile(`Found client in database: ${JSON.stringify(client)}`);

            // Change to the correct directory first
            await logToFile('Changing to OpenVPN easy-rsa directory');
            process.chdir('/etc/openvpn/easy-rsa');

            // Execute revocation commands exactly as in the shell script
            const commands = [
                {
                    cmd: './easyrsa --batch revoke ' + name,
                    description: 'Revoking certificate'
                },
                {
                    cmd: './easyrsa gen-crl',
                    description: 'Generating new CRL'
                },
                {
                    cmd: `rm -rf pki/reqs/${name}.req`,
                    description: 'Removing request file'
                },
                {
                    cmd: `rm -rf pki/private/${name}.key`,
                    description: 'Removing private key'
                },
                {
                    cmd: `rm -rf pki/issued/${name}.crt`,
                    description: 'Removing certificate'
                },
                {
                    cmd: 'rm -rf /etc/openvpn/crl.pem',
                    description: 'Removing old CRL'
                },
                {
                    cmd: 'cp /etc/openvpn/easy-rsa/pki/crl.pem /etc/openvpn/crl.pem',
                    description: 'Copying new CRL'
                },
                {
                    cmd: 'chmod 644 /etc/openvpn/crl.pem',
                    description: 'Setting CRL permissions'
                },
                {
                    cmd: 'systemctl restart openvpn@server',
                    description: 'Restarting OpenVPN service'
                }
            ];

            // Execute commands sequentially
            for (const command of commands) {
                try {
                    await logToFile(`Executing: ${command.description}`);
                    await logToFile(`Command: ${command.cmd}`);
                    const { stdout, stderr } = await execAsync(command.cmd);
                    if (stdout) await logToFile(`${command.description} stdout: ${stdout}`);
                    if (stderr) await logToFile(`${command.description} stderr: ${stderr}`);
                } catch (error: any) {
                    await logToFile(`Error during ${command.description}: ${error.message}`);
                    if (error.stdout) await logToFile(`Error stdout: ${error.stdout}`);
                    if (error.stderr) await logToFile(`Error stderr: ${error.stderr}`);
                    // Continue with other commands even if one fails
                }
            }

            // Remove from database
            await logToFile(`Removing ${name} from database`);
            const result = await db.run('DELETE FROM vpn_clients WHERE name = ?', name);
            await logToFile(`Database deletion result: ${JSON.stringify(result)}`);

            if (result.changes === 0) {
                await logToFile('Warning: No rows were deleted from the database');
            }

            await logToFile(`=== Completed deletion process for client ${name} ===\n`);
            
            res.json({ 
                message: 'Client deleted successfully',
                details: {
                    databaseChanges: result.changes
                }
            });

        } catch (error: any) {
            await logToFile(`Critical error in delete process: ${error.message}`);
            await logToFile(`Error stack: ${error.stack}`);
            await logToFile(`Error code: ${error.code}`);
            await logToFile(`=== Delete process failed for client ${name} ===\n`);

            res.status(500).json({ 
                error: 'Failed to delete client',
                message: error.message,
                details: error.code
            });
        }
    });

    app.get('/api/clients', authenticateToken, async (req, res) => {
        try {
            const clients = await db.all('SELECT * FROM vpn_clients');
            console.log('Sending clients to frontend:', clients); // Debug log
            res.json(clients);
        } catch (error) {
            console.error('Error fetching clients:', error);
            res.status(500).json({ error: 'Failed to fetch clients' });
        }
    });

    app.get('/api/clients/:name/config', authenticateToken, async (req, res) => {
        try {
            const { name } = req.params;
            
            // Check if client exists
            const client = await db.get('SELECT * FROM vpn_clients WHERE name = ?', name);
            if (!client) {
                return res.status(404).json({ error: 'Client not found' });
            }

            // Path to the client config template and keys
            const templatePath = '/etc/openvpn/client-template.txt';
            const caPath = '/etc/openvpn/easy-rsa/pki/ca.crt';
            const certPath = `/etc/openvpn/easy-rsa/pki/issued/${name}.crt`;
            const keyPath = `/etc/openvpn/easy-rsa/pki/private/${name}.key`;

            // Read all necessary files
            const [template, ca, cert, key] = await Promise.all([
                fs.promises.readFile(templatePath, 'utf8'),
                fs.promises.readFile(caPath, 'utf8'),
                fs.promises.readFile(certPath, 'utf8'),
                fs.promises.readFile(keyPath, 'utf8')
            ]);

            // Generate config file content
            let config = template
                .replace('{{CLIENT_NAME}}', name)
                .replace('{{CA_CERT}}', ca)
                .replace('{{CLIENT_CERT}}', cert)
                .replace('{{CLIENT_KEY}}', key);

            // Set headers for file download
            res.setHeader('Content-Type', 'application/x-openvpn-profile');
            res.setHeader('Content-Disposition', `attachment; filename=${name}.ovpn`);
            res.send(config);

        } catch (error) {
            console.error('Error generating client config:', error);
            res.status(500).json({ error: 'Failed to generate client configuration' });
        }
    });

    // Serve Angular app for all other routes
    app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, '../dist/browser/index.html'));
    });

    // Add error handling middleware
    app.use((err: any, req: any, res: any, next: any) => {
        console.error('Error:', err);
        res.status(err.status || 500).json({
            message: err.message || 'Internal Server Error',
            error: process.env.NODE_ENV === 'development' ? err : {}
        });
    });

    // Start server
    app.listen(PORT, HOST, () => {
        console.log(`Server running on ${HOST}:${PORT}`);
        console.log(`CORS origin: ${process.env.SERVER_ADDRESS || 'all origins'}`);
    });

    // Run immediately and log any errors
    try {
        await updateClientStatus();
    } catch (error: any) {
        console.error('Initial update failed:', error);
    }

    // Schedule updates
    setInterval(async () => {
        try {
            await updateClientStatus();
        } catch (error: any) {
            console.error('Scheduled update failed:', error);
        }
    }, 5000);
})();
