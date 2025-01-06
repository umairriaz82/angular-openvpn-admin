# OpenVPN Admin Interface

A comprehensive OpenVPN management solution with an automated installer, featuring a modern Angular frontend and Node.js backend. This project provides a web-based interface for managing OpenVPN users, certificates, and configurations.

## Overview

The project consists of three main components:

1. **Automated Installer Script**: A bash script that handles the complete installation and configuration of OpenVPN and the admin interface.
2. **Frontend**: A modern web interface built with Angular, providing an intuitive UI for OpenVPN management.
3. **Backend**: A Node.js/Express server handling API requests and OpenVPN operations.

### Features

- One-click OpenVPN server installation and configuration
- Web-based management interface
- User-friendly client certificate management
  - Create and revoke client certificates
  - Download client configuration files
  - View active connections
- Real-time VPN connection monitoring
  - Monitor bandwidth usage
  - View connected clients
  - Check connection status
- Secure authentication system
- Automated security configuration
- Self-signed SSL or Let's Encrypt certificate integration

## Quick Installation

To install OpenVPN and the admin interface, run these commands as root:

Download the installer script
```bash
wget https://raw.githubusercontent.com/umairriaz82/angular-openvpn-admin/main/automated_openvpn_installer.sh
```

Make the script executable
```bash
chmod +x automated_openvpn_installer.sh
```

Run the installer
```bash
./automated_openvpn_installer.sh
```

The installer will:
1. Set up OpenVPN with secure defaults
2. Install and configure the web admin interface
3. Set up SSL certificates for secure access
4. Configure firewall rules
5. Provide you with access credentials

## System Requirements

- Ubuntu 20.04 LTS or newer
- Root access or sudo privileges
- Minimum 1GB RAM
- 10GB available disk space
- Public IP address or domain name

## Post-Installation

After installation completes, you can access the admin interface at:

```
https://<your-domain-or-ip>
```

Default credentials will be provided at the end of the installation process.

## Troubleshooting

If you encounter issues:

1. Check the service status:
```bash
systemctl status openvpn-admin
systemctl status openvpn@server
```

2. View the logs:
```bash
tail -f /var/log/openvpn-admin.log
tail -f /var/log/openvpn-admin.error.log
```

3. Common issues:
   - If the web interface is not accessible, check your firewall settings
   - If clients can't connect, verify the server is running and port is open
   - For certificate issues, check the easy-rsa configuration

## Security Considerations

- Change the default admin password after first login
- Keep your system updated
- Regularly backup your OpenVPN configurations
- Monitor system logs for suspicious activity
- Use strong passwords for VPN users

## Architecture

### Frontend (Angular)
- Modern, responsive UI
- Real-time status updates
- Certificate management interface
- User management dashboard

### Backend (Node.js)
- RESTful API
- OpenVPN configuration management
- Certificate authority operations
- User authentication and authorization

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For issues and feature requests, please create an issue in the GitHub repository.

## Acknowledgments

- OpenVPN Community
- Angular Team
- Node.js Community
- All contributors who have helped with the project

## Disclaimer

This software is provided as-is, without any warranties. Always test in a safe environment before deploying to production.

