# Logger Utility

A centralized logging utility with category filtering for better debugging control.

## Usage

```typescript
import { createLogger } from './utils/logger.js';

const logger = createLogger('MIDI');

logger.log('Connection established');      // [MIDI] Connection established
logger.info('Initializing...');             // [MIDI] ℹ️ Initializing...
logger.warn('High latency detected');       // [MIDI] ⚠️ High latency detected
logger.error('Connection failed');          // [MIDI] ❌ Connection failed
logger.debug('Verbose debug info');         // [MIDI] 🔍 Verbose debug info
```

## Global Configuration

Control logging behavior globally:

```typescript
import { LoggerConfig } from './utils/logger.js';

// Set minimum log level (hide debug and log, show only info, warn, error)
LoggerConfig.setLogLevel('info');

// Enable specific categories
LoggerConfig.enableCategory('MIDI');
LoggerConfig.enableCategory('Actions');

// Disable specific categories
LoggerConfig.disableCategory('TabletController');

// Enable/disable all categories
LoggerConfig.enableAll();    // Default - shows everything
LoggerConfig.disableAll();   // Silent mode

// Show timestamps
LoggerConfig.enableTimestamps();  // [2025-11-04T10:30:45.123Z] [MIDI] ...
LoggerConfig.disableTimestamps(); // Default
```

## Categories in Utils

The following categories are used in the utils folder:

- `Actions` - Action system (button handlers, chord changes)
- `ChordProgression` - Chord progression state management
- `MIDI` - MIDI I/O operations
- `DeviceFinder` - HID device detection and connection
- `TabletController` - High-level tablet management
- `HID` - Low-level HID data reading

## Examples

### Debug a specific component

```typescript
// In browser console:
window.LoggerConfig = LoggerConfig;  // Expose to console

// Then in console:
LoggerConfig.disableAll();
LoggerConfig.enableCategory('MIDI');
// Now only MIDI logs will show
```

### Production mode

```typescript
// Hide debug logs in production
LoggerConfig.setLogLevel('warn');  // Only warnings and errors
```

### Verbose debugging

```typescript
// Show everything including debug logs
LoggerConfig.setLogLevel('debug');
LoggerConfig.enableAll();
LoggerConfig.enableTimestamps();
```

## Child Loggers

Create sub-categories for better organization:

```typescript
const logger = createLogger('MIDI');
const inputLogger = logger.child('Input');   // [MIDI:Input] ...
const outputLogger = logger.child('Output'); // [MIDI:Output] ...
```

## Migration Guide

Replace old console logs with logger:

```typescript
// Before:
console.log('[MIDI] Connection established');
console.warn('[MIDI] High latency');
console.error('[MIDI] Connection failed');

// After:
import { createLogger } from './logger.js';
const logger = createLogger('MIDI');

logger.log('Connection established');
logger.warn('High latency');
logger.error('Connection failed');
```

## Files Updated

✅ `utils/actions.ts` - Actions category  
✅ `utils/music/chord-progression-state.ts` - ChordProgression category  
🔄 `utils/music/midi.ts` - MIDI category (in progress)  
🔄 `utils/tablet/finddevice.ts` - DeviceFinder category (in progress)  
🔄 `utils/tablet/tablet-controller.ts` - TabletController category (in progress)  
🔄 `utils/tablet/hid-reader.ts` - HID category (in progress)  

