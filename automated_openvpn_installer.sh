#!/bin/bash

# Colors for better readability
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored messages
print_info() {
    echo -e "${GREEN}[INFO] $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}[WARNING] $1${NC}"
}

print_error() {
    echo -e "${RED}[ERROR] $1${NC}"
}

# Function to check if script is run as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        print_error "This script must be run as root"
        exit 1
    fi
}

# Function to cleanup existing OpenVPN installation
cleanup_existing() {
    print_info "Cleaning up existing OpenVPN and web application installation..."
    
    # Stop services if running
    print_info "Stopping services..."
    systemctl stop openvpn@server 2>/dev/null
    systemctl stop openvpn-admin 2>/dev/null
    
    # Disable services
    print_info "Disabling services..."
    systemctl disable openvpn@server 2>/dev/null
    systemctl disable openvpn-admin 2>/dev/null
    
    # Remove systemd service files
    print_info "Removing service files..."
    rm -f /etc/systemd/system/openvpn-admin.service
    rm -f /etc/systemd/system/openvpn-iptables.service
    systemctl daemon-reload
    
    # Remove OpenVPN packages
    print_info "Removing OpenVPN packages..."
    apt-get remove --purge -y openvpn easy-rsa 2>/dev/null
    
    # Remove web application
    print_info "Removing web application..."
    rm -rf /opt/openvpn-admin
    
    # Remove OpenVPN directories and files
    print_info "Removing OpenVPN directories and files..."
    rm -rf /etc/openvpn
    rm -rf /usr/share/easy-rsa
    rm -rf /var/log/openvpn
    
    # Remove database file if exists
    print_info "Removing database..."
    rm -f /opt/openvpn-admin/backend/vpn.db
    
    # Clean up any remaining processes
    print_info "Cleaning up processes..."
    pkill -f "openvpn" 2>/dev/null || true
    pkill -f "ts-node" 2>/dev/null || true
    
    # Clean up iptables rules
    print_info "Cleaning up iptables rules..."
    iptables -t nat -F
    iptables -t nat -X
    rm -f /etc/iptables/rules.v4
    
    print_info "Cleanup completed successfully"
}

# Function to get public IP
get_public_ip() {
    PUBLIC_IP=$(curl -s https://api.ipify.org)
    if [[ -z "$PUBLIC_IP" ]]; then
        print_error "Could not detect public IP"
        exit 1
    fi
}

# Function to setup server address
setup_server_address() {
    get_public_ip
    
    # Prompt with default value
    read -p "Use Public IP or FQDN [${PUBLIC_IP}]: " SERVER_ADDRESS
    
    # If empty, use default PUBLIC_IP
    SERVER_ADDRESS=${SERVER_ADDRESS:-$PUBLIC_IP}
    
    print_info "Using server address: $SERVER_ADDRESS"
}

# Function to setup VPN port
setup_vpn_port() {
    echo -e "\nVPN Port Configuration:"
    echo "1. Use default port (1194)"
    echo "2. Use custom port"
    echo "3. Use random port"
    read -p "Select option [1-3] (default: 1): " port_choice
    
    case $port_choice in
        2)
            read -p "Enter custom port number: " PORT
            ;;
        3)
            PORT=$(shuf -i 10000-65000 -n 1)
            print_info "Random port selected: $PORT"
            ;;
        *)
            PORT=1194
            ;;
    esac
}

# Function to setup DNS
setup_dns() {
    echo -e "\nDNS Configuration:"
    echo "1. Use default (Google DNS)"
    echo "2. Cloudflare"
    echo "3. OpenDNS"
    echo "4. Custom DNS"
    read -p "Select option [1-4] (default: 1): " dns_choice
    
    case $dns_choice in
        2)
            DNS1="1.1.1.1"
            DNS2="1.0.0.1"
            ;;
        3)
            DNS1="208.67.222.222"
            DNS2="208.67.220.220"
            ;;
        4)
            read -p "Enter primary DNS: " DNS1
            read -p "Enter secondary DNS: " DNS2
            ;;
        *)
            DNS1="8.8.8.8"
            DNS2="8.8.4.4"
            ;;
    esac
}

# Function to setup admin credentials
setup_admin_credentials() {
    print_info "Setting up admin portal credentials..."
    
    # Set default username
    ADMIN_USERNAME="admin"
    
    # Prompt for password with confirmation
    while true; do
        echo -n "Enter admin portal password: "
        read -s ADMIN_PASSWORD
        echo
        echo -n "Confirm admin portal password: "
        read -s ADMIN_PASSWORD_CONFIRM
        echo
        
        if [ "$ADMIN_PASSWORD" = "$ADMIN_PASSWORD_CONFIRM" ]; then
            if [ ${#ADMIN_PASSWORD} -ge 8 ]; then
                print_info "Admin password set successfully"
                break
            else
                print_error "Password must be at least 8 characters long"
            fi
        else
            print_error "Passwords do not match. Please try again."
        fi
    done
}

# Function to install required packages
install_packages() {
    print_info "Updating system packages..."
    apt-get update
    
    print_info "Installing required packages..."
    apt-get install -y openvpn easy-rsa ufw
}

# Function to configure firewall
configure_firewall() {
    print_info "Configuring firewall..."
    
    # Allow SSH (port 22) and OpenVPN port
    ufw allow ssh
    ufw allow $PORT/udp
    ufw allow 3000/tcp
    
    # Enable UFW if not already enabled
    if ! ufw status | grep -q "Status: active"; then
        echo "y" | ufw enable
    fi
}

# Function to setup OpenVPN
setup_openvpn() {
    print_info "Setting up OpenVPN..."
    
    # Setup easy-rsa
    mkdir -p /etc/openvpn/easy-rsa
    cp -r /usr/share/easy-rsa/* /etc/openvpn/easy-rsa/
    
    # Generate server configuration
    cat > /etc/openvpn/server.conf <<EOF
port $PORT
proto udp
dev tun
ca ca.crt
cert server.crt
key server.key
dh dh.pem
server 10.8.0.0 255.255.255.0
push "redirect-gateway def1 bypass-dhcp"
push "dhcp-option DNS $DNS1"
push "dhcp-option DNS $DNS2"
keepalive 10 120
cipher AES-256-CBC
user nobody
group nogroup
persist-key
persist-tun
status /var/log/openvpn/openvpn-status.log
log /var/log/openvpn/openvpn.log
verb 3
explicit-exit-notify 1
EOF

    # Create log directory
    mkdir -p /var/log/openvpn
    
    # Initialize PKI
    cd /etc/openvpn/easy-rsa
    ./easyrsa init-pki
    echo "yes" | ./easyrsa build-ca nopass
    echo "yes" | ./easyrsa gen-dh
    echo "yes" | ./easyrsa build-server-full server nopass
    
    # Copy generated files to OpenVPN directory
    cp pki/ca.crt /etc/openvpn/
    cp pki/issued/server.crt /etc/openvpn/
    cp pki/private/server.key /etc/openvpn/
    cp pki/dh.pem /etc/openvpn/
}

# Function to enable IP forwarding
enable_ip_forwarding() {
    echo 1 > /proc/sys/net/ipv4/ip_forward
    echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf
    sysctl -p
}

# Function to configure iptables and NAT
configure_iptables() {
    print_info "Configuring iptables rules..."
    
    # Install iptables-persistent
    echo iptables-persistent iptables-persistent/autosave_v4 boolean true | debconf-set-selections
    echo iptables-persistent iptables-persistent/autosave_v6 boolean true | debconf-set-selections
    apt-get install -y iptables-persistent
    
    # Get the primary network interface
    INTERFACE=$(ip -4 route ls | grep default | grep -Po '(?<=dev )(\S+)')
    
    # Add NAT rules
    iptables -t nat -A POSTROUTING -s 10.8.0.0/24 -o $INTERFACE -j MASQUERADE
    
    # Allow forwarding
    iptables -A FORWARD -i tun0 -j ACCEPT
    iptables -A FORWARD -o tun0 -j ACCEPT
    
    # Save iptables rules
    mkdir -p /etc/iptables
    iptables-save > /etc/iptables/rules.v4
    
    # Create systemd service for iptables persistence
    cat > /etc/systemd/system/openvpn-iptables.service <<EOF
[Unit]
Description=OpenVPN IP Tables Configuration
Before=network.target

[Service]
Type=oneshot
ExecStart=/sbin/iptables-restore /etc/iptables/rules.v4
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF

    # Enable and start the service
    systemctl enable openvpn-iptables
    systemctl start openvpn-iptables
    
    print_info "iptables configuration completed"
}

# Function to verify installation
verify_installation() {
    print_info "Verifying installation..."
    
    # Check OpenVPN service status
    if ! systemctl is-active --quiet openvpn@server; then
        print_error "OpenVPN service is not running"
        exit 1
    fi
    
    # Check IP forwarding
    if [[ $(cat /proc/sys/net/ipv4/ip_forward) != 1 ]]; then
        print_error "IP forwarding is not enabled"
        exit 1
    fi
    
    # Check iptables rules
    if ! iptables -t nat -C POSTROUTING -s 10.8.0.0/24 -o $(ip -4 route ls | grep default | grep -Po '(?<=dev )(\S+)') -j MASQUERADE 2>/dev/null; then
        print_error "NAT rules are not properly configured"
        exit 1
    fi
    
    print_info "Installation verification completed successfully"
}

# Function to install Node.js and npm
install_nodejs() {
    print_info "Installing Node.js and npm..."
    
    # Install curl if not present
    apt-get install -y curl
    
    # Install Node.js repository
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    
    # Install Node.js and npm
    apt-get install -y nodejs
    
    # Verify installation
    NODE_VERSION=$(node --version)
    NPM_VERSION=$(npm --version)
    
    print_info "Node.js version: $NODE_VERSION"
    print_info "npm version: $NPM_VERSION"
}

# Function to create client template
create_client_template() {
    print_info "Creating client template..."
    
    # Create client template file
    cat > /etc/openvpn/client-template.txt <<EOF
client
dev tun
proto udp
remote {{SERVER_ADDRESS}} {{PORT}}
resolv-retry infinite
nobind
persist-key
persist-tun
cipher AES-256-GCM
auth SHA256
key-direction 1
verb 3

<ca>
{{CA_CERT}}
</ca>

<cert>
{{CLIENT_CERT}}
</cert>

<key>
{{CLIENT_KEY}}
</key>
EOF

    # Replace placeholders with actual values
    sed -i "s/{{SERVER_ADDRESS}}/$SERVER_ADDRESS/g" /etc/openvpn/client-template.txt
    sed -i "s/{{PORT}}/$PORT/g" /etc/openvpn/client-template.txt
    
    print_info "Client template created successfully"
}

# Function to deploy web application
deploy_web_application() {
    print_info "Starting web application deployment..."
    
    # Ensure port 3000 is not in use
    print_info "Checking for existing processes on port 3000..."
    PORT_CHECK=3000
    EXISTING_PID=$(lsof -t -i:$PORT_CHECK || true)
    if [ -n "$EXISTING_PID" ]; then
        print_info "Killing process using port $PORT_CHECK (PID: $EXISTING_PID)..."
        kill -9 $EXISTING_PID
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

    # Update admin credentials in server.ts
    print_info "Updating admin credentials in server.ts..."
    
    # Create sed command to update the password
    ESCAPED_PASSWORD=$(echo "$ADMIN_PASSWORD" | sed 's/[\/&]/\\&/g')
    
    # Update server.ts with the new password
    sed -i "/await db.run('INSERT INTO users (username, password) VALUES (?, ?)', 'admin',/c\        await db.run('INSERT INTO users (username, password) VALUES (?, ?)', 'admin', '$ESCAPED_PASSWORD');" /opt/openvpn-admin/backend/src/server.ts
    
    print_info "Admin credentials updated successfully"
    
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

    # Update CRL configuration
    print_info "Updating OpenVPN CRL configuration..."
    cd /etc/openvpn/easy-rsa
    ./easyrsa gen-crl
    cp pki/crl.pem /etc/openvpn/
    chown nobody:nogroup /etc/openvpn/crl.pem
    chmod 644 /etc/openvpn/crl.pem

    # Add CRL verification to OpenVPN server config if not present
    if ! grep -q "crl-verify" /etc/openvpn/server.conf; then
        echo "crl-verify /etc/openvpn/crl.pem" >> /etc/openvpn/server.conf
    fi

    # Restart OpenVPN service
    systemctl restart openvpn@server

    print_info "Web application deployment completed successfully"
    print_info "You can access the admin interface at http://your-server-ip:3000"
}

# Main script execution
main() {
    check_root
    cleanup_existing
    setup_server_address
    setup_vpn_port
    setup_dns
    setup_admin_credentials
    install_packages
    configure_firewall
    setup_openvpn
    enable_ip_forwarding
    configure_iptables
    create_client_template
    
    # Start OpenVPN service
    systemctl start openvpn@server
    systemctl enable openvpn@server
    
    # Verify installation
    verify_installation
    
    # Install Node.js and deploy web application
    install_nodejs
    deploy_web_application
    
    print_info "OpenVPN server and admin interface have been successfully installed!"
    print_info "Server Address: $SERVER_ADDRESS"
    print_info "Port: $PORT"
    print_info "Protocol: UDP"
    print_info "Admin Interface: http://$SERVER_ADDRESS:3000"
    print_info "Admin Username: $ADMIN_USERNAME"
    print_info "Admin Password: [as configured]"
}

# Run main function
main