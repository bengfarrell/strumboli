# Strumboli - Linux/Raspberry Pi Setup Guide

Complete guide for building, installing, and running Strumboli on Linux systems, specifically Raspberry Pi.

## Table of Contents

- [For End Users](#for-end-users)
  - [Quick Installation](#quick-installation)
  - [Running Strumboli](#running-strumboli)
  - [Service Management](#service-management)
  - [Configuration](#configuration)
  - [Troubleshooting](#troubleshooting)
- [For Developers](#for-developers)
  - [Building from Source](#building-from-source)
  - [Creating the Installer](#creating-the-installer)
  - [Testing](#testing)
  - [Distribution](#distribution)
- [Technical Reference](#technical-reference)
  - [Installation Layout](#installation-layout)
  - [Implementation Details](#implementation-details)
  - [Platform Support](#platform-support)
  - [Architecture Notes](#architecture-notes)

---

## For End Users

### Quick Installation

#### Prerequisites

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install system dependencies
sudo apt install -y libhidapi-hidraw0 libhidapi-dev

# Optional: Install ALSA MIDI tools for testing
sudo apt install -y alsa-utils
```

#### Install from Debian Package

1. Download the `.deb` package to your Raspberry Pi

2. Install the package:
```bash
sudo apt install ./strumboli-1.0.0-raspberry-pi.deb
```

3. The application is now installed in `/opt/strumboli/`

4. Configure permissions (required for HID and MIDI access):
```bash
sudo usermod -a -G input,audio $USER
# Log out and back in for changes to take effect
```

#### Verify Installation

```bash
./verify-linux-setup.sh
```

This checks:
- System requirements
- Dependencies installed
- User permissions
- Hardware detection
- Service status

### Running Strumboli

**Option 1: Run manually**
```bash
strumboli
```

**Option 2: Run as a service (recommended for auto-start)**
```bash
# Start the service
sudo systemctl start strumboli

# Enable auto-start on boot
sudo systemctl enable strumboli

# Check status
sudo systemctl status strumboli
```

**Option 3: Run directly from installation directory**
```bash
cd /opt/strumboli
./strumboli.sh
```

### Service Management

#### Using the Helper Script (Recommended)

```bash
./strumboli-service.sh start      # Start service
./strumboli-service.sh stop       # Stop service
./strumboli-service.sh restart    # Restart service
./strumboli-service.sh status     # Check status
./strumboli-service.sh logs       # View recent logs
./strumboli-service.sh follow     # Follow live logs
./strumboli-service.sh enable     # Enable auto-start on boot
./strumboli-service.sh disable    # Disable auto-start
./strumboli-service.sh help       # Show all commands
```

#### Using systemd Directly

```bash
# Start/Stop/Restart
sudo systemctl start strumboli
sudo systemctl stop strumboli
sudo systemctl restart strumboli

# Enable/Disable auto-start on boot
sudo systemctl enable strumboli
sudo systemctl disable strumboli

# Check status
sudo systemctl status strumboli

# View logs
journalctl -u strumboli -n 50      # Recent logs
journalctl -u strumboli -f         # Follow live
journalctl -u strumboli --since today   # Today's logs
```

### Configuration

The configuration file is located at `/opt/strumboli/settings.json`.

**Edit configuration:**
```bash
sudo nano /opt/strumboli/settings.json
```

**After editing, restart the service:**
```bash
sudo systemctl restart strumboli
# Or
./strumboli-service.sh restart
```

### Web Dashboard

When Strumboli is running, access the web dashboard at:
```
http://localhost:8080
```

Or from another device on the same network:
```
http://YOUR_PI_IP:8080
```

To find your Raspberry Pi's IP address:
```bash
hostname -I
```

### Troubleshooting

#### HID Device Not Found

1. Check if device is connected:
```bash
lsusb
```

2. Check HID devices:
```bash
ls -l /dev/hidraw*
```

3. Verify permissions:
```bash
# Add user to input group
sudo usermod -a -G input $USER
# Log out and back in

# Or run with sudo (not recommended for production)
sudo strumboli
```

#### MIDI Not Working

1. List MIDI devices:
```bash
aconnect -l
```

2. Check ALSA MIDI:
```bash
amidi -l
```

3. Verify audio group membership:
```bash
groups $USER
```

4. Add to audio group if needed:
```bash
sudo usermod -a -G audio $USER
# Log out and back in
```

#### Service Won't Start

1. Check service status:
```bash
sudo systemctl status strumboli
```

2. View detailed logs:
```bash
journalctl -u strumboli -n 100 --no-pager
# Or
./strumboli-service.sh logs
```

3. Check configuration file:
```bash
cat /opt/strumboli/settings.json
```

4. Test manual run:
```bash
# Stop service first
sudo systemctl stop strumboli

# Run manually to see output
cd /opt/strumboli
./Strumboli
```

#### Web Dashboard Not Accessible

1. Check if service is running:
```bash
sudo systemctl status strumboli
```

2. Verify port is listening:
```bash
sudo netstat -tlnp | grep 8080
```

3. Check firewall (if enabled):
```bash
sudo ufw allow 8080/tcp
```

#### Common Issues Quick Reference

| Issue | Solution |
|-------|----------|
| Permission denied on HID device | `sudo usermod -a -G input,audio $USER` then log out/in |
| Service won't start | Check logs: `journalctl -u strumboli -n 100` |
| Can't access web dashboard | Verify service running and port 8080 open |
| MIDI not working | Add to audio group, verify MIDI devices with `aconnect -l` |

### Performance Tips for Raspberry Pi

#### Reduce CPU Usage

1. **Disable unused services:**
```bash
# List running services
systemctl list-units --type=service --state=running

# Disable unnecessary services (example)
sudo systemctl disable bluetooth
```

2. **Use a quality power supply:**
   - Ensure stable 5V 3A power supply
   - Avoid USB power from computer

#### Raspberry Pi Model Recommendations

- **Raspberry Pi 4:** ✅ Recommended for best performance
- **Raspberry Pi 3:** ✅ Works well, may need overclocking for complex setups
- **Raspberry Pi Zero:** ❌ Not recommended (too slow)

### Uninstalling

```bash
# Stop and disable service
sudo systemctl stop strumboli
sudo systemctl disable strumboli

# Uninstall package
sudo apt remove strumboli

# Remove configuration (optional)
sudo rm -rf /opt/strumboli
```

### Updating

To update Strumboli:
```bash
# Download new version
wget https://releases/strumboli-1.1.0-raspberry-pi.deb

# Stop service
sudo systemctl stop strumboli

# Install update
sudo apt install ./strumboli-1.1.0-raspberry-pi.deb

# Start service
sudo systemctl start strumboli
```

---

## For Developers

### Building from Source

#### 1. Install Build Dependencies

```bash
# System dependencies
sudo apt install -y python3 python3-pip python3-venv libhidapi-hidraw0 libhidapi-dev

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install Python dependencies
pip install -r requirements.txt

# Install Node.js dependencies
npm install
```

#### 2. Build Application

**Method A: Using npm scripts (recommended - includes TypeScript/Rollup build)**
```bash
npm run build:linux      # Build app
npm run build:deb        # Build app + create .deb package
```

**Method B: Using shell scripts directly**
```bash
./build-linux.sh         # Build app only
./create-deb.sh          # Create .deb package
```

**Output:**
- Standalone app: `dist/Strumboli/`
- Debian package: `dist/strumboli-1.0.0-raspberry-pi.deb`

### Creating the Installer

The `create-deb.sh` script creates a Debian package that includes:
- Standalone application in `/opt/strumboli/`
- Systemd service file
- Desktop entry
- Command-line launcher (`strumboli` command)
- Pre/post installation scripts

**Customize the build:**

1. **Edit PyInstaller spec:**
```bash
nano server/midi-strummer-linux.spec
```

2. **Edit build script:**
```bash
nano build-linux.sh
```

3. **Edit package creator:**
```bash
nano create-deb.sh
```

4. **Rebuild:**
```bash
./build-linux.sh
./create-deb.sh
```

### Testing

#### Testing Checklist

- [ ] Build completes without errors
- [ ] Package installs successfully
- [ ] Service starts and runs
- [ ] HID device is detected
- [ ] MIDI output works
- [ ] Web dashboard is accessible
- [ ] Auto-start on boot works
- [ ] Logs are accessible via journalctl
- [ ] Service management script works
- [ ] Package uninstalls cleanly
- [ ] Permissions are set correctly
- [ ] Configuration file is accessible
- [ ] Multiple interfaces (stylus + buttons) work

#### Manual Testing Steps

1. **Test the build process:**
```bash
./build-linux.sh
./create-deb.sh
```

2. **Test the installer:**
```bash
sudo apt install ./dist/strumboli-1.0.0-raspberry-pi.deb
./verify-linux-setup.sh
```

3. **Test auto-start:**
```bash
sudo systemctl enable strumboli
sudo reboot
# After reboot:
sudo systemctl status strumboli
```

4. **Test service management:**
```bash
./strumboli-service.sh status
./strumboli-service.sh logs
```

### Distribution

#### Option 1: GitHub Releases

```bash
# Using GitHub CLI
gh release create v1.0.0 \
  dist/strumboli-1.0.0-raspberry-pi.deb \
  --title "Strumboli v1.0.0" \
  --notes "Release notes here"
```

Users download and install:
```bash
wget https://github.com/username/repo/releases/download/v1.0.0/strumboli-1.0.0-raspberry-pi.deb
sudo apt install ./strumboli-1.0.0-raspberry-pi.deb
```

#### Option 2: Direct Download

Host on your website:
```bash
# Users download with:
wget https://yoursite.com/strumboli-1.0.0-raspberry-pi.deb
sudo apt install ./strumboli-1.0.0-raspberry-pi.deb
```

#### Option 3: Custom APT Repository (Advanced)

Create a custom APT repository for easier updates via `apt update && apt upgrade`.

---

## Technical Reference

### Installation Layout

After installing the `.deb` package:

```
/opt/strumboli/              # Application directory
├── Strumboli                # Main executable
├── strumboli.sh             # Launcher script
├── settings.json            # Configuration file
├── _internal/               # Bundled dependencies
└── public/                  # Web dashboard files

/usr/bin/strumboli           # Command symlink
/usr/share/applications/strumboli.desktop    # Desktop entry
/etc/systemd/system/strumboli.service        # Systemd service
```

### Implementation Details

#### Build Scripts

| File | Purpose |
|------|---------|
| `build-linux.sh` | Builds standalone Linux application using PyInstaller |
| `server/midi-strummer-linux.spec` | PyInstaller configuration for Linux builds |
| `create-deb.sh` | Creates Debian package (.deb) installer |

#### Management Tools

| File | Purpose |
|------|---------|
| `strumboli-service.sh` | User-friendly service management helper |
| `verify-linux-setup.sh` | System verification tool |

#### Systemd Service

The installer creates a systemd service file at `/etc/systemd/system/strumboli.service`:

```ini
[Unit]
Description=Strumboli MIDI Controller
After=network.target sound.target

[Service]
Type=simple
User=pi
WorkingDirectory=/opt/strumboli
ExecStart=/opt/strumboli/Strumboli
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
Environment="DISPLAY=:0"

[Install]
WantedBy=multi-user.target
```

**Features:**
- Auto-restart on failure
- Runs as 'pi' user (configurable)
- Logs to systemd journal
- Can be enabled for boot-time startup

#### Package Installation

The Debian package:
- **Application**: `/opt/strumboli/`
- **Service file**: `/etc/systemd/system/strumboli.service`
- **Desktop entry**: `/usr/share/applications/strumboli.desktop`
- **Command symlink**: `/usr/bin/strumboli`

#### Dependency Management

The package automatically handles dependencies:
- `libhidapi-hidraw0` - HID device access
- `libhidapi-dev` - HID development headers

#### Post-Install Configuration

The package provides:
- Automatic service daemon reload
- Instructions for enabling auto-start
- Proper file permissions
- Easy command-line access via `strumboli` command

#### Clean Uninstallation

The package includes pre-removal scripts that:
- Stop running service
- Disable auto-start
- Clean up systemd daemon

### Platform Support

#### Supported Platforms

| Platform | Architecture | Status | Notes |
|----------|--------------|--------|-------|
| Raspberry Pi 4 | ARMv8 (armhf/arm64) | ✅ Fully Supported | Recommended |
| Raspberry Pi 3 | ARMv7 (armhf) | ✅ Fully Supported | May need overclocking |
| Raspberry Pi Zero | ARMv6 | ❌ Too slow | Not recommended |
| Debian/Ubuntu (ARM) | ARMv7/ARMv8 | ✅ Should work | Same as RPi |
| Debian/Ubuntu (x86_64) | x86_64 | 🟡 Untested | May need spec adjustments |

#### Architecture Configuration

Currently configured for:
- **ARM (armhf)**: Raspberry Pi 3/4
- Can be adapted for other architectures (arm64, amd64) by changing the `Architecture` field in the Debian control file

### Architecture Notes

#### Comparison: macOS vs Linux

| Feature | macOS (DMG) | Linux (DEB) |
|---------|-------------|-------------|
| Build Script | `build.sh` | `build-linux.sh` |
| Installer Script | `create-dmg.sh` | `create-deb.sh` |
| Package Format | DMG disk image | Debian package (.deb) |
| Installation | Drag to Applications | `apt install` |
| Auto-start | Login items or launchd | systemd service |
| Service Manager | Manual or launchctl | systemd + helper script |
| Verification | Manual | `verify-linux-setup.sh` |
| Uninstall | Drag to trash | `apt remove` |
| Updates | Replace .app | Install new .deb |

#### Platform-Specific Considerations

**Raspberry Pi Optimizations:**
1. Service runs as 'pi' user by default
2. Console-mode application (no GUI required)
3. Resource limits can be added to service file
4. Automatic restart on failure
5. Logging to journal for easy debugging

**Permissions:**
- HID device access requires `input` group membership
- MIDI access requires `audio` group membership
- Instructions provided in post-install messages

**Performance:**
- PyInstaller optimized build
- Minimal dependencies
- Efficient ARM binary
- Option to disable unused services (Bluetooth, etc.)

### Advanced Configuration

#### Custom systemd Service

To customize the systemd service:
```bash
sudo nano /etc/systemd/system/strumboli.service
```

Example customizations:

```ini
[Service]
# Change user (default is 'pi')
User=myuser

# Add environment variables
Environment="CUSTOM_VAR=value"

# Change restart behavior
Restart=always
RestartSec=3

# Resource limits
MemoryLimit=512M
CPUQuota=50%
```

After editing:
```bash
sudo systemctl daemon-reload
sudo systemctl restart strumboli
```

#### Headless Setup

For headless operation (no GUI):

1. Enable SSH:
```bash
sudo raspi-config
# Interface Options -> SSH -> Enable
```

2. Set up auto-login (optional):
```bash
sudo raspi-config
# System Options -> Boot/Auto Login -> Console Autologin
```

3. Enable service on boot:
```bash
sudo systemctl enable strumboli
```

### Future Enhancements

Potential improvements:

1. **Multi-architecture builds**
   - arm64 for newer Raspberry Pi models
   - amd64 for desktop Linux

2. **AppImage support**
   - Universal Linux binary
   - No installation required

3. **Auto-updater**
   - Check for updates
   - Download and install new versions

4. **Web-based configuration**
   - Edit settings through web dashboard
   - No need to edit files manually

5. **Snap/Flatpak support**
   - Alternative packaging formats
   - Broader Linux distribution support

6. **Network discovery**
   - mDNS/Avahi integration
   - Easy discovery on local network

---

## Use Cases

This setup is perfect for:

- **Always-on MIDI controller** - Auto-starts on boot
- **Headless operation** - Runs as a service
- **Live performances** - Reliable, background operation
- **Studio setup** - Integrated with DAW via MIDI
- **Portable rig** - Raspberry Pi + tablet = portable MIDI controller

---

## Support

For issues, questions, or contributions, visit the project repository.

---

## Summary

The Linux installer provides:
- ✅ Easy installation via Debian package
- ✅ Auto-start capability with systemd
- ✅ Service management via helper script or systemd
- ✅ System verification tool
- ✅ Comprehensive documentation
- ✅ Proper dependency handling
- ✅ Clean uninstallation
- ✅ Log integration with journalctl

Perfect for Raspberry Pi users who want a reliable, always-on MIDI controller!

