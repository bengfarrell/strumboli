# Device Drivers

This directory contains device profile configurations for supported graphics tablets and HID devices.

## Profile Structure

Each device profile is a JSON file containing:

- **Device identification** (vendor ID, product ID, product name)
- **Byte code mappings** (how to interpret HID data)
- **Capabilities** (buttons, pressure levels, resolution)
- **Report ID** (expected HID report identifier)

## Using a Device Profile

### Option 1: Auto-detection (Recommended)

Let the system automatically detect your device:

```json
{
  "startupConfiguration": {
    "drawingTablet": "auto-detect"
  }
}
```

### Option 2: Specific Profile

Reference a profile by name:

```json
{
  "startupConfiguration": {
    "drawingTablet": "xp_pen_deco_640"
  }
}
```

### Option 3: Inline Configuration

Use inline configuration (backward compatible):

```json
{
  "startupConfiguration": {
    "drawingTablet": {
      "product": "Deco 640",
      "byteCodeMappings": { ... }
    }
  }
}
```

## Supported Devices

- **xp_pen_deco_640** - XP-Pen Deco 640 (8 express keys, 16K pressure levels)

## Creating a New Profile

1. Use the test tools to identify byte mappings for your device
2. Copy an existing profile as a template
3. Update device info, VID/PID, and byte mappings
4. Test thoroughly
5. Submit as a pull request!

## Profile Fields

### Required
- `name` - Human-readable device name
- `byteCodeMappings` - Byte interpretation rules

### Optional
- `manufacturer` - Device manufacturer
- `model` - Model number/name
- `vendorId`, `productId` - USB identifiers (hex strings)
- `deviceInfo` - HID enumeration filters
  - `interfaces` - Array of interface numbers to open (e.g., `[2]` or `[0, 1]`)
- `reportId` - Expected HID Report ID (default: 2)
- `capabilities` - Device capabilities documentation

### Multiple Interfaces

Some tablets split functionality across multiple HID interfaces:
- **Linux (Zynthian)**: XP-Pen uses `"interfaces": [0, 1]` (interface 0 for buttons, interface 1 for stylus)
- **macOS**: XP-Pen uses `"interfaces": [2]` (everything on interface 2)

The `interfaces` array specifies which interface numbers to open and monitor.

