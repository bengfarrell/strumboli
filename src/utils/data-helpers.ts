/**
 * Data processing utilities for HID device data
 */

/**
 * Parse range data from byte array
 */
export function parseRangeData(data: number[], byteIndex: number, minVal: number = 0, maxVal: number = 0): number {
    const value = data[byteIndex];
    if (maxVal === minVal) {
        return 0.0;
    }
    return (value - minVal) / (maxVal - minVal);
}

/**
 * Parse multi-byte range data from byte array
 * Combines multiple bytes (typically low byte + high byte) into a single value
 */
export function parseMultiByteRangeData(
    data: number[], 
    byteIndices: number[], 
    minVal: number = 0, 
    maxVal: number = 0,
    _debugName?: string
): number {
    if (!byteIndices || byteIndices.length === 0) {
        return 0.0;
    }
    
    // Combine bytes: each subsequent byte is shifted by 8 bits more
    let value = 0;
    for (let i = 0; i < byteIndices.length; i++) {
        const byteIdx = byteIndices[i];
        if (byteIdx < data.length) {
            value += data[byteIdx] << (8 * i);
        }
    }
    
    if (maxVal === minVal) {
        return 0.0;
    }
    
    const normalized = (value - minVal) / (maxVal - minVal);
    return normalized;
}

/**
 * Parse bipolar range data from byte array
 * Handles values that have both positive and negative ranges where byte values
 * "wrap around" at the byte boundary (e.g., 0-60 = positive, 196-255 = negative)
 */
export function parseBipolarRangeData(
    data: number[], 
    byteIndex: number,
    posMin: number = 0,
    posMax: number = 0,
    negMin: number = 0,
    negMax: number = 0
): number {
    const value = data[byteIndex];
    if (value < negMax) {
        if (posMax === posMin) {
            return 0.0;
        }
        return value / (posMax - posMin);
    } else {
        if (negMin === negMax) {
            return 0.0;
        }
        return -(negMin - value) / (negMin - negMax);
    }
}

/**
 * Parse code from byte array using lookup values
 */
export function parseCode(data: number[], byteIndex: number, values: Record<string, any> | any[]): any {
    const code = data[byteIndex];
    
    // Handle object-based lookup (like status codes)
    if (typeof values === 'object' && !Array.isArray(values)) {
        const codeStr = String(code);
        if (codeStr in values) {
            return values[codeStr];
        }
        return {};
    }
    
    // Handle array-based lookup (legacy)
    if (Array.isArray(values) && code < values.length) {
        return values[code];
    }
    
    return 0;
}

/**
 * Parse bit flags from a byte into individual button states
 * Each bit represents a button (0=released, 1=pressed)
 */
export function parseBitFlags(data: number[], byteIndex: number, buttonCount: number = 8): Record<string, boolean> {
    if (byteIndex >= data.length) {
        return {};
    }
    
    const flags = data[byteIndex];
    const result: Record<string, boolean> = {};
    
    for (let i = 0; i < buttonCount; i++) {
        const buttonKey = `button${i + 1}`;
        // Check if bit i is set (button is pressed)
        result[buttonKey] = Boolean(flags & (1 << i));
    }
    
    return result;
}

/**
 * Apply an exponential curve mapping to a normalized value
 */
export function applyCurve(value: number, curve: number = 1.0, inputRange: [number, number] = [0.0, 1.0]): number {
    const [minVal, maxVal] = inputRange;
    
    // Handle edge cases
    if (value <= minVal) return minVal;
    if (value >= maxVal) return maxVal;
    if (curve === 1.0) return value;  // Linear passthrough for efficiency
    
    // Normalize to 0-1 range
    const normalized = (value - minVal) / (maxVal - minVal);
    
    // Apply exponential curve: (e^(curve*x) - 1) / (e^curve - 1)
    const curved = (Math.exp(curve * normalized) - 1) / (Math.exp(curve) - 1);
    
    // Scale back to original range
    return minVal + (curved * (maxVal - minVal));
}

/**
 * Calculate an effect value using a unified approach
 */
export function calculateEffectValue(
    inputValue: number,
    minVal: number,
    maxVal: number,
    multiplier: number = 1.0,
    curve: number = 1.0,
    spread: 'direct' | 'inverse' | 'central' = 'direct'
): number {
    // Apply multiplier to input
    let scaledInput = inputValue * multiplier;
    // Clamp to 0-1 range after multiplier
    scaledInput = Math.max(0.0, Math.min(1.0, scaledInput));
    
    // Apply spread mapping
    if (spread === 'central') {
        // Central mode: center (0.5) maps to max, edges (0.0 and 1.0) map to min
        const distanceFromCenter = Math.abs(scaledInput - 0.5) * 2.0;
        const curvedDistance = applyCurve(distanceFromCenter, curve, [0.0, 1.0]);
        return maxVal - (curvedDistance * (maxVal - minVal));
    } else if (spread === 'inverse') {
        // Inverse mode: high input = low output
        const curvedValue = applyCurve(scaledInput, curve, [0.0, 1.0]);
        return maxVal - (curvedValue * (maxVal - minVal));
    } else {
        // Direct mode: normal mapping (low input = low output)
        const curvedValue = applyCurve(scaledInput, curve, [0.0, 1.0]);
        return minVal + (curvedValue * (maxVal - minVal));
    }
}

/**
 * Apply an effect calculation based on its control configuration
 */
export function applyEffect(
    effectConfig: any,
    controlInputs: Record<string, number>,
    _effectName: string = ''
): number {
    const controlType = effectConfig.control;
    
    // Return default if no control configured or control not available
    if (!controlType || !(controlType in controlInputs)) {
        return effectConfig.default ?? 0.0;
    }
    
    // Get the input value for this control type
    const inputValue = controlInputs[controlType];
    
    // Apply effect calculation
    return calculateEffectValue(
        inputValue,
        effectConfig.min ?? 0.0,
        effectConfig.max ?? 1.0,
        effectConfig.multiplier ?? 1.0,
        effectConfig.curve ?? 1.0,
        effectConfig.spread ?? 'direct'
    );
}

