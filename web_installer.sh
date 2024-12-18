#!/bin/bash

set -e  # Exit immediately if a command exits with a non-zero status
set -o pipefail  # Exit on pipe failure

# Helper function for informational output
print_info() {
    echo -e "\033[1;34m[INFO]\033[0m $1"
}

# Install necessary packages
print_info "Installing required packages..."
apt-get update && apt-get install -y git netcat

# Ensure port 3000 is not in use
print_info "Checking for existing processes on port 3000..."
PORT=3000
EXISTING_PID=$(lsof -t -i:$PORT || true)
if [ -n "$EXISTING_PID" ]; then
    print_info "Killing process using port $PORT (PID: $EXISTING_PID)..."
    kill -9 $EXISTING_PID
else
    print_info "No process using port $PORT."
fi

# Create and clean directory
print_info "Setting up /opt/openvpn-admin directory..."
rm -rf /opt/openvpn-admin
mkdir -p /opt/openvpn-admin
cd /opt/openvpn-admin

# Clone the repository
print_info "Cloning the OpenVPN Admin repository..."
git clone https://github.com/umairriaz82/angular-openvpn-admin.git .

# Install Angular CLI globally
print_info "Installing Angular CLI globally..."
npm install -g @angular/cli

# Build frontend
print_info "Building frontend..."
cd frontend
npm install
ng build --configuration production

# Setup backend
print_info "Setting up backend..."
cd ../backend

# Install backend dependencies
print_info "Installing backend dependencies..."
npm install

# Install TypeScript and ts-node globally
print_info "Installing TypeScript and ts-node globally..."
npm install -g typescript ts-node

# Create logs directory
print_info "Creating logs directory..."
mkdir -p logs

# Create systemd service
print_info "Creating systemd service for OpenVPN Admin..."
cat > /etc/systemd/system/openvpn-admin.service <<EOF
[Unit]
Description=OpenVPN Admin Web Interface
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/openvpn-admin/backend
ExecStart=/usr/bin/ts-node src/server.ts
Restart=always
Environment=NODE_ENV=production
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd and start the service
print_info "Reloading systemd daemon and starting OpenVPN Admin service..."
systemctl daemon-reload
systemctl enable openvpn-admin
systemctl restart openvpn-admin

# Wait for the service to start
print_info "Waiting for OpenVPN Admin service to start..."
sleep 5

# Verify service status
print_info "Checking OpenVPN Admin service status..."
systemctl status openvpn-admin --no-pager

# OpenVPN CRL Setup
print_info "Generating and updating OpenVPN CRL..."
cd /etc/openvpn/easy-rsa
./easyrsa gen-crl
cp pki/crl.pem /etc/openvpn/

print_info "Setting correct permissions for CRL..."
chown nobody:nogroup /etc/openvpn/crl.pem
chmod 644 /etc/openvpn/crl.pem

print_info "Restarting OpenVPN service..."
systemctl restart openvpn@server

print_info "OpenVPN CRL setup completed successfully."