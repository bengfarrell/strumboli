# XP-Pen Deco 640 - Complete Technical Documentation

This document contains comprehensive technical details, configuration instructions, and troubleshooting for the XP-Pen Deco 640 graphics tablet across all platforms and modes.

## Table of Contents

1. [Platform Overview](#platform-overview)
2. [macOS Without Driver](#macos-without-driver)
3. [Configuration & Setup](#configuration--setup)
4. [Linux/Raspberry Pi](#linuxraspberry-pi)
5. [Testing & Verification](#testing--verification)
6. [Troubleshooting](#troubleshooting)
7. [Known Hardware Issues](#known-hardware-issues)

---

## Platform Overview

The XP-Pen Deco 640 behaves very differently depending on:
- **Platform**: macOS, Linux, Windows
- **Driver Status**: With manufacturer's driver vs without driver
- **Access Method**: WebHID (browser) vs native HID (Python)

### Quick Reference Table

| Platform | Driver | Product ID | Report ID | Interfaces | Button Method |
|----------|--------|------------|-----------|------------|---------------|
| macOS | With | 0x0914 | 2 | Single (usage 1) | HID Reports |
| macOS | Without (Web) | 0x2904 | 2 | Multiple | Keyboard Events |
| macOS | Without (Python) | 0x2904 | 7 | Multiple | Keyboard Events |
| Linux | N/A | varies | 6, 7 | Dual (0, 1) | HID Reports (ID 6) |

---

## macOS Without Driver

When the XP-Pen driver is **not installed** on macOS, the tablet operates in a fundamentally different mode.

### Device Identification

**Product ID Changes:**
- **With driver**: `0x0914` (2324 decimal)
- **Without driver**: `0x2904` (10500 decimal)

This is effectively a **different device** to the OS, requiring separate configuration files.

### Multiple HID Interfaces

The tablet presents **3 HID interfaces** when the driver is not installed:

| Interface | Usage Page | Description | Accessible? |
|-----------|------------|-------------|-------------|
| 1 | 65290 (0xFF0A) | Vendor-specific | ❌ Protected by OS/browser |
| 2 | 13 (Digitizer) | Stylus data | ✅ Yes |
| 3 | 1 (Generic Desktop) | Mouse/Keyboard | ✅ Yes |

**Note**: Interface 1 (vendor-specific) cannot be opened via WebHID due to browser security restrictions.

### Data Format Differences: WebHID vs Python

This is a **critical discovery**: WebHID and Python's hidapi see **different data formats** from the same device!

#### WebHID (Browser) - Report ID 2

WebHID **strips the Report ID** from the data buffer:

```
Received: [a0, 0a, 16, 9b, 15, 00, 00, fd, 04]
          ↑   ↑       ↑       ↑       ↑   ↑
          |   |       |       |       |   |
        Status  X      Y    Pressure  Tilt
```

**Byte Mapping:**
- Byte 0: Status (0xa0 = hover)
- Bytes 1-2: X coordinate
- Bytes 3-4: Y coordinate
- Bytes 5-6: Pressure
- Byte 7: Tilt X
- Byte 8: Tilt Y

**Configuration File**: `xp_pen_deco_640_osx_nodriver_web.json`

#### Python hidapi - Report ID 7

Python **includes the Report ID** in the data buffer:

```
Received: [07, a0, 0a, 16, 9b, 15, 00, 00, fd, 04]
           ↑   ↑   ↑       ↑       ↑       ↑   ↑
           |   |   |       |       |       |   |
        ReportID Status X   Y    Pressure  Tilt
```

**Byte Mapping:**
- Byte 0: Report ID (0x07)
- Byte 1: Status (0xa0 = hover)
- Bytes 2-3: X coordinate
- Bytes 4-5: Y coordinate
- Bytes 6-7: Pressure
- Byte 8: Tilt X
- Byte 9: Tilt Y

**Configuration File**: `xp_pen_deco_640_osx_nodriver.json`

#### Why the Difference?

This is a fundamental difference in how the two HID APIs work:

**WebHID**:
- Browser spec defines that Report ID is **not** included in the `data` buffer
- Report ID is accessible via `event.reportId` separately
- This is standard WebHID behavior across all browsers

**Python hidapi**:
- Returns the raw HID report including the Report ID as the first byte
- This is standard hidapi behavior across platforms
- You must parse the Report ID from byte 0

**Consequence**: You **must use different configuration files** for browser vs Python!

### Coordinate Resolution

**With driver**: 32000 x 18000  
**Without driver**: 16000 x 9000 (**half resolution**)

The no-driver mode reports exactly half the resolution of with-driver mode.

### Tablet Button Behavior

**Critical Finding**: Tablet buttons **DO NOT** send HID reports in no-driver mode on macOS.

#### Testing Methodology

We confirmed this by:
1. Running `data_monitor.py` while pressing tablet buttons
2. Result: **Zero HID data** when buttons pressed
3. Stylus movement generates data, buttons do not

#### What Actually Happens

macOS intercepts the button HID reports at the **kernel level** and converts them to keyboard events **before** user-space applications can access them.

**Button → Keyboard Mappings:**

| Button | Key | Modifiers | Notes |
|--------|-----|-----------|-------|
| 1 | b | None | Simple key |
| 2 | e | None | Simple key |
| 3 | [ | None | Left bracket |
| 4 | ] | None | Right bracket |
| 5 | - | Ctrl | Zoom out |
| 6 | + | Ctrl | Zoom in |
| 7 | z | Ctrl | **Undo shortcut** ⚠️ |
| 8 | Z | Ctrl+Shift | **Redo shortcut** ⚠️ |

**Note**: Buttons 7 and 8 use common application shortcuts. The implementations prevent default behavior where possible, but focus must be on the Strumboli window.

**Solution**: Both WebHID and Python implementations use **keyboard event listeners** to capture button presses.

### Mouse Cursor Behavior

#### Python Server (Exclusive Access)

When Python opens the HID device with `hidapi`:
- ✅ Gets **exclusive access**
- ✅ **Blocks OS from reading** the device
- ✅ **Mouse cursor stops moving** - tablet no longer controls mouse
- ✅ Professional, clean experience

**Code:**
```python
device = hid.device()
device.open(vendor_id, product_id)  # Exclusive access
```

#### WebHID Browser (Shared Access)

When browser opens via WebHID:
- ❌ **Cannot** get exclusive access (security restriction)
- ❌ OS continues reading device in parallel
- ❌ **Mouse cursor continues moving** - cannot be prevented
- ℹ️ This is **intentional** browser security behavior

**Why**: WebHID deliberately prevents exclusive access to avoid malicious websites from hijacking input devices.

**Workaround Options**:
1. Hide cursor with CSS: `body { cursor: none; }`
2. Use fullscreen mode
3. Accept the mouse movement
4. **Recommended**: Use Python server for real work

### Configuration Files

Three separate files are needed for the various modes:

| File | Purpose | Report ID | Byte Offset |
|------|---------|-----------|-------------|
| `xp_pen_deco_640_osx.json` | With driver | 2 | Status at byte 1 |
| `xp_pen_deco_640_osx_nodriver.json` | Python no-driver | 7 | Status at byte 1 |
| `xp_pen_deco_640_osx_nodriver_web.json` | WebHID no-driver | 2 | Status at byte 0 |

---

## Configuration & Setup

### Python Server Setup

#### Requirements

```bash
pip install pynput>=1.7.0
```

#### macOS Permissions

Grant accessibility permissions to Terminal (or your IDE):
1. System Preferences → Security & Privacy → Privacy → Accessibility
2. Add Terminal to the list
3. Restart the server

This allows the keyboard listener to monitor keyboard events for tablet buttons.

#### Auto-Detection (Recommended)

No configuration needed! Just use:

```json
{
  "startupConfiguration": {
    "drawingTablet": "auto-detect"
  }
}
```

The server will:
- Detect the tablet by product ID (0x2904)
- Load `xp_pen_deco_640_osx_nodriver.json`
- Start the keyboard listener automatically
- Handle hotplug connect/disconnect

#### Manual Profile Selection

If auto-detection fails:

```json
{
  "startupConfiguration": {
    "drawingTablet": "xp_pen_deco_640_osx_nodriver"
  }
}
```

#### Running the Server

```bash
cd server
python main.py
```

**Expected output:**
```
[FindDevice] ✓ Auto-detected: XP-Pen Deco 640 (driver: xp_pen_deco_640_osx_nodriver)
[Keyboard] Keyboard listener started successfully
Strumboli server started with HID device (1 interface(s)). Press Ctrl+C to exit.
```

### Browser Direct Mode Setup

#### Configuration

In `direct.html` (browser-based mode), you need to manually configure your `settings.json` since auto-detection is not available.

Copy the contents from `xp_pen_deco_640_osx_nodriver_web.json` into your `settings.json`:

```json
{
  "startupConfiguration": {
    "drawingTablet": {
      "product": "Deco 640",
      "usage": 2,
      "reportId": 2,
      "byteCodeMappings": {
        "status": {
          "byteIndex": 0,
          "type": "code",
          "values": {
            "192": { "state": "none" },
            "160": { "state": "hover" },
            "162": { "state": "hover", "secondaryButtonPressed": true },
            "164": { "state": "hover", "primaryButtonPressed": true },
            "161": { "state": "contact" },
            "163": { "state": "contact", "secondaryButtonPressed": true },
            "165": { "state": "contact", "primaryButtonPressed": true }
          }
        },
        "x": {
          "byteIndices": [1, 2],
          "max": 16000,
          "type": "multi-byte-range"
        },
        "y": {
          "byteIndices": [3, 4],
          "max": 9000,
          "type": "multi-byte-range"
        },
        "pressure": {
          "byteIndices": [5, 6],
          "max": 16383,
          "type": "multi-byte-range"
        },
        "tiltX": {
          "byteIndex": 7,
          "positiveMax": 60,
          "negativeMin": 256,
          "negativeMax": 196,
          "type": "bipolar-range"
        },
        "tiltY": {
          "byteIndex": 8,
          "positiveMax": 60,
          "negativeMin": 256,
          "negativeMax": 196,
          "type": "bipolar-range"
        },
        "tabletButtons": {
          "type": "keyboard-events",
          "buttonCount": 8,
          "keyMappings": {
            "1": { "key": "b", "code": "KeyB" },
            "2": { "key": "e", "code": "KeyE" },
            "3": { "key": "[", "code": "BracketLeft" },
            "4": { "key": "]", "code": "BracketRight" },
            "5": { "key": "-", "code": "NumpadSubtract", "ctrlKey": true },
            "6": { "key": "+", "code": "NumpadAdd", "ctrlKey": true },
            "7": { "key": "z", "code": "KeyZ", "ctrlKey": true },
            "8": { "key": "Z", "code": "KeyZ", "ctrlKey": true, "shiftKey": true }
          }
        }
      }
    }
  }
}
```

#### WebHID Autoconnect Limitations

**Important**: In browser-based "direct mode", WebHID security requires explicit user permission to access HID devices.

**What this means:**
1. **No automatic connection** - Browser cannot automatically connect without user interaction
2. **User must click "Connect Tablet"** - Every time the page loads
3. **Permission persists** - Once granted, browser remembers (until permissions cleared)

**Why**: WebHID is a security-sensitive API. Browsers prevent malicious websites from accessing USB devices without explicit user authorization.

**Workaround**: If you need automatic connection, use **Python server mode** instead. The server handles HID device connection and communicates with the browser via WebSocket, which doesn't have the same security restrictions.

---

## Linux/Raspberry Pi

### Multiple Interface Architecture

The XP-Pen Deco 640 exposes **two separate HID interfaces** on Linux/Raspberry Pi:

- **Interface 0**: Tablet buttons (Report ID 6)
- **Interface 1**: Stylus data (Report ID 7)

This is different from macOS, which uses a **single interface** (with or without driver).

### Button Data Format

Buttons send HID reports on **Interface 0** with **Report ID 6**.

**Unlike macOS no-driver mode**, buttons **DO** send HID reports on Linux. No keyboard event listener is needed.

### Configuration

**File**: `xp_pen_deco_640_zynthian.json`

Key differences:
- Opens both Interface 0 and 1
- Uses Report ID 6 for buttons (HID reports, not keyboard)
- Uses Report ID 7 for stylus
- Different byte mappings optimized for Linux driver

---

## Testing & Verification

### Check Product ID

Verify which mode the tablet is in:

```bash
python -c "import hid; devices = [d for d in hid.enumerate() if d['vendor_id'] == 0x28bd]; [print(f\"Product ID: 0x{d['product_id']:04x}\") for d in devices]"
```

Expected:
- `0x0914` (2324) - Driver installed
- `0x2904` (10500) - No driver (no-driver mode) ✅

### Monitor HID Data

Check what data the tablet is actually sending:

```bash
cd server/discovery
python data_monitor.py 0x28bd 0x2904
```

**Move stylus** - You should see:
```
[I1] ReportID: 7 | 07 a0 0a 16 9b 15 00 00 fd 04 | X: 5642 Y: 5531 P: 0
```

**Press buttons** - You should see **NO data** (confirms keyboard events only).

### Test Keyboard Listener

Test the keyboard listener standalone:

```bash
cd server
python keyboardlistener.py
```

Press tablet buttons or keyboard keys (b, e, [, ], etc.). Should see:
```
[Keyboard] Button 1 pressed
>>> Button 1 PRESSED
[Keyboard] Button 1 released
>>> Button 1 RELEASED
```

Press Esc to exit.

### Verify Stylus Input

Move the stylus over the tablet - verify in the visualizer:
- **X range**: 0-16000
- **Y range**: 0-9000
- **Pressure**: 0-16383
- **Tilt**: -60 to +60

### Verify Stylus Buttons

Test the stylus buttons (pen tip and side buttons) - they should register in the stylus buttons panel.

### Verify Tablet Buttons

Press each tablet button (1-8). You should see:
- Button highlight in the tablet buttons visualizer
- Assigned action executes (if configured)
- Console log: `[Keyboard] Button N pressed via keyboard`

---

## Troubleshooting

### Buttons Not Working

**Symptoms**: Pressing tablet buttons does nothing.

**Solutions**:

1. **Verify driver is uninstalled**
   - Check product ID (should be 0x2904, not 0x0914)
   - Completely uninstall XP-Pen driver if installed

2. **Grant accessibility permissions** (macOS)
   - System Preferences → Security & Privacy → Accessibility
   - Add Terminal or your IDE
   - Restart the server

3. **Ensure window has focus**
   - Click on the terminal or browser window
   - Keyboard events only work when window has focus

4. **Test with keyboard keys**
   - Press 'b' key → Should trigger button 1
   - Press 'e' key → Should trigger button 2
   - If this works, keyboard listener is OK

5. **Check console for keyboard listener**
   ```
   [Keyboard] Keyboard listener started successfully
   ```
   If not present, check pynput installation

### No Stylus Data

**Symptoms**: Moving stylus shows no data in visualizer.

**Solutions**:

1. **Check which profile loaded**
   ```
   [FindDevice] ✓ Auto-detected: XP-Pen Deco 640 (driver: xp_pen_deco_640_osx_nodriver)
   ```
   Should say `osx_nodriver`, not just `osx`

2. **Verify product ID matches**
   - Run: `python data_monitor.py 0x28bd 0x2904`
   - Move stylus - should see data
   - If no data, device might be in wrong mode

3. **Check Report ID**
   - Python expects Report ID 7
   - WebHID expects Report ID 2
   - Wrong profile → wrong Report ID → no data

4. **Try manual profile selection**
   ```json
   {
     "startupConfiguration": {
       "drawingTablet": "xp_pen_deco_640_osx_nodriver"
     }
   }
   ```

### Wrong Product ID Detected

**Symptom**: Auto-detection loads the wrong profile.

**Solution**: Driver may still be partially installed. Check:

```bash
ps aux | grep -i pentablet
ls -la /Applications/PenTablet.app
```

If found, completely uninstall the XP-Pen driver.

### Protected Interface Error (WebHID)

**Symptom**: `NotAllowedError` when connecting via browser.

**Cause**: Trying to open the vendor-specific interface (usage page 65290).

**Solution**: The profile's `excludedUsagePages: [65290]` should prevent this. If still occurring:
- Clear browser permissions
- Reconnect device
- Select only the digitizer interface

### Coordinates Out of Range

**Symptom**: Coordinates exceed expected values.

**Check**:
- **No-driver mode**: Max should be 16000 x 9000
- **With-driver mode**: Max should be 32000 x 18000

**Solution**: You're using the wrong profile. Check product ID and switch profiles.

### Hotplug Detection Issues

**Symptom**: After unplugging/replugging, device doesn't work immediately.

**Solutions**:

1. **Wait 3-5 seconds** after replugging before moving stylus
2. **Unplug/replug again** - Second time usually works
3. **Restart server** - Always works

**Why**: The device needs a moment to initialize after being plugged in.

### Mouse Cursor Still Moving (Browser)

**This is normal** for WebHID mode and **cannot be prevented**.

**Workarounds**:
- Hide cursor: `body { cursor: none; }`
- Use fullscreen mode
- **Recommended**: Use Python server for exclusive access

---

## Known Hardware Issues

### Issue 1: Coordinate Updates Stop on Button Press

**Problem**: When pressing the primary or secondary stylus buttons, coordinate updates may stop or become erratic.

**Platforms**: All platforms  
**Status**: Hardware/firmware limitation

**Workaround**: None currently. This is a known tablet firmware issue.

### Issue 2: Button 7 and 8 Collision (Linux Only)

**Problem**: On Raspberry Pi/Linux, both buttons 7 and 8 send the **same byte value** (29) on the button interface.

**Why**: This appears to be a Linux kernel driver or firmware encoding issue when using separate interfaces.

**Impact**: Cannot distinguish between button 7 and 8 presses.

**Current Behavior**: Value 29 is mapped to button 7. Button 8 may not trigger correctly.

**Investigation Needed**:
1. Check if other byte values indicate button 8
2. Test with different Linux kernel versions
3. Verify firmware version matches macOS behavior

**Status**: Unresolved hardware/firmware limitation

---

## Recommendations

### For Production Use

**Use Python Server** (`main.py`):
- ✅ Exclusive device access (no mouse interference)
- ✅ Auto-detection works
- ✅ Hotplug support
- ✅ Better performance
- ✅ Keyboard listener handles buttons automatically

### For Development/Testing

**Use Browser Mode** (`direct.html`):
- ⚠️ Mouse cursor will move (cannot prevent)
- ⚠️ Manual device connection required (WebHID security)
- ⚠️ Must configure settings.json manually
- ✅ Good for testing and debugging
- ✅ No server needed

### For Cross-Platform

Maintain **separate device profiles** per platform:
- `xp_pen_deco_640_osx.json` - macOS with driver
- `xp_pen_deco_640_osx_nodriver.json` - macOS Python no-driver
- `xp_pen_deco_640_osx_nodriver_web.json` - macOS WebHID no-driver
- `xp_pen_deco_640_zynthian.json` - Linux/Raspberry Pi

The server's auto-detection will choose the correct one based on product ID.

---

## Debugging Commands Reference

### Check all interfaces
```bash
python -c "import hid; devices = [d for d in hid.enumerate() if d['vendor_id'] == 0x28bd and d['product_id'] == 0x2904]; [print(f\"Usage Page: {d['usage_page']}, Usage: {d['usage']}\") for d in devices]"
```

### Monitor specific interface
```bash
cd server/discovery
python data_monitor.py 0x28bd 0x2904 -i 1
```

### Test keyboard listener
```bash
cd server
python keyboardlistener.py
```

### Check device count
```bash
python -c "import hid; devices = [d for d in hid.enumerate() if d['vendor_id'] == 0x28bd and d['product_id'] == 0x2904]; print(f'Found {len(devices)} devices')"
```

Should return "Found 6 devices" (the 6 interfaces).

---

## Version History

- **v1.0** (2025-11-02): Initial documentation with Linux issues
- **v2.0** (2025-11-02): Added macOS no-driver mode details
- **v3.0** (2025-11-02): Added WebHID vs Python differences, separate configs
- **v4.0** (2025-11-02): Merged comprehensive documentation, added full setup and troubleshooting

**Last Updated**: 2025-11-02  
**Tested On**: macOS Sequoia 15.1+, Raspberry Pi OS (Debian)  
**Contributors**: Tested and documented through extensive real-world usage
