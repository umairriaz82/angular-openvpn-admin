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
    print_info "Cleaning up existing OpenVPN installation..."
    
    # Stop OpenVPN service if running
    systemctl stop openvpn@server 2>/dev/null
    
    # Remove OpenVPN packages
    apt-get remove --purge -y openvpn easy-rsa 2>/dev/null
    
    # Remove OpenVPN directories
    rm -rf /etc/openvpn
    rm -rf /usr/share/easy-rsa
    
    print_info "Cleanup completed"
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

# Main script execution
main() {
    check_root
    cleanup_existing
    setup_server_address
    setup_vpn_port
    setup_dns
    install_packages
    configure_firewall
    setup_openvpn
    enable_ip_forwarding
    configure_iptables
    
    # Start OpenVPN service
    systemctl start openvpn@server
    systemctl enable openvpn@server
    
    # Verify installation
    verify_installation
    
    print_info "OpenVPN server has been successfully installed and configured!"
    print_info "Server Address: $SERVER_ADDRESS"
    print_info "Port: $PORT"
    print_info "Protocol: UDP"
    print_info "Client configuration files can be generated using:"
    print_info "cd /etc/openvpn/easy-rsa && ./easyrsa build-client-full CLIENT_NAME nopass"
}

# Run main function
main