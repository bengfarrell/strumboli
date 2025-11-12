# Zynthian Driver Configuration Guide

## Which Driver to Use?

### Quick Decision Tree

1. **Check your tablet's Product ID** on Zynthian:
   ```bash
   lsusb | grep -i xp-pen
   ```

2. **Or use Python to get detailed info**:
   ```bash
   python3 -c "import hid; devices = [d for d in hid.enumerate() if d['vendor_id'] == 0x28bd]; print('Product ID: 0x{:04x}'.format(devices[0]['product_id']) if devices else 'Not found')"
   ```

### Based on Product ID:

| Product ID | Status | Driver File to Use |
|------------|--------|-------------------|
| `0x0914` (2324) | With manufacturer driver | `xp_pen_deco_640_zynthian.json` |
| `0x2904` (10500) | Without manufacturer driver | `xp_pen_deco_640_zynthian_nodriver.json` ⭐ NEW |

## Driver Comparison

### xp_pen_deco_640_zynthian.json (WITH Driver)
- Product ID: `0x0914`
- Resolution: 32000 x 18000 (full)
- For systems WITH XPPen manufacturer driver installed
- Button handling: HID Reports (bit-flags)
- Single interface with driver-processed data

### xp_pen_deco_640_zynthian_nodriver.json (NO Driver) ⭐
- Product ID: `0x2904`
- Resolution: 16000 x 9000 (half resolution, but still plenty!)
- For systems WITHOUT XPPen manufacturer driver
- Button handling: HID Reports (code values on interface 0)
- Dual interfaces: [0] buttons, [1] stylus
- **Recommended** for most Zynthian setups

## Configuration

### Method 1: Auto-Detection (Recommended)

In your `settings.json`:
```json
{
  "startupConfiguration": {
    "drawingTablet": "auto-detect",
    "midiOutputBackend": "jack",
    "jackClientName": "midi_strummer"
  }
}
```

The system will automatically detect which driver to use based on Product ID.

### Method 2: Explicit Driver Selection

If auto-detection has issues, specify the driver:

```json
{
  "startupConfiguration": {
    "drawingTablet": "xp_pen_deco_640_zynthian_nodriver",
    "midiOutputBackend": "jack",
    "jackClientName": "midi_strummer"
  }
}
```

## Testing Your Configuration

### 1. Verify Device Detection
```bash
cd server
python3 main.py
```

Look for:
```
[FindDevice] ✓ Auto-detected: XP-Pen Deco 640 (driver: xp_pen_deco_640_zynthian_nodriver)
Strumboli server started with HID device (2 interface(s)). Press Ctrl+C to exit.
```

### 2. Test Stylus Input
- Move stylus over tablet
- Check web dashboard at `http://localhost:8080`
- X should range 0-16000
- Y should range 0-9000
- Pressure should respond to pen pressure

### 3. Test Buttons
- Press each of the 8 tablet buttons
- Should see button highlights in dashboard
- Check assigned actions execute

### 4. Monitor Raw Data (Optional)
```bash
cd server/discovery
python3 data_monitor.py 0x28bd 0x2904
```

Move stylus - should see:
```
[I1] ReportID: 7 | X: #### Y: #### P: ####
```

Press buttons - should see:
```
[I0] ReportID: 6 | Button data...
```

## Troubleshooting

### Problem: Wrong Driver Loaded

**Symptom**: System loads `xp_pen_deco_640_zynthian` instead of `xp_pen_deco_640_zynthian_nodriver`

**Solution**:
1. Check Product ID (see commands above)
2. If `0x2904`, manually specify the no-driver version in settings
3. Ensure no manufacturer drivers installed

### Problem: No Stylus Data

**Solutions**:
1. Verify both interfaces are opened (should see "2 interface(s)")
2. Check Report ID is 7 for stylus data
3. Try manual driver selection

### Problem: Buttons Don't Work

**Solutions**:
1. Verify interface 0 is opened
2. Check button Report ID is 6
3. Some buttons may share codes (button 7 and 8 both use code 29)

### Problem: Resolution Seems Wrong

**Check**: 
- No-driver mode: max X=16000, Y=9000
- With-driver mode: max X=32000, Y=18000

If you're getting 32000x18000 but want no-driver, a driver is still installed.

## Performance Notes

### No-Driver Mode Advantages (0x2904):
✅ No extra software to install  
✅ Simpler system setup  
✅ Works out-of-box on most Linux systems  
✅ 16000x9000 is plenty for musical control  
✅ Less likely to have hotplug issues  

### With-Driver Mode Advantages (0x0914):
✅ Full 32000x18000 resolution  
✅ May have more refined pressure curves  
✅ Driver handles some preprocessing  

**Recommendation**: Use no-driver mode (`0x2904`) for Zynthian unless you specifically need the higher resolution.

## Summary

Most Zynthian users should:
1. **Don't install XPPen drivers** - use kernel HID support
2. Use **`xp_pen_deco_640_zynthian_nodriver.json`** driver
3. Set **`"drawingTablet": "auto-detect"`** in settings
4. Enjoy plug-and-play operation! 🎸

---

*Created: 2025-11-02*  
*For Strumboli on Zynthian Oram OS*

