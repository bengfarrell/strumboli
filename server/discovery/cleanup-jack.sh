#!/bin/bash

# Jack and Stromboli Cleanup Script
# Fixes zombie processes and corrupted Jack shared memory

echo "🧹 Cleaning up Jack and Stromboli..."
echo "======================================"

# 1. Kill all related processes
echo "1. Stopping processes..."
killall -9 jackd 2>/dev/null && echo "  ✓ Killed jackd"
killall -9 python 2>/dev/null && echo "  ✓ Killed python"
killall -9 python3 2>/dev/null && echo "  ✓ Killed python3"

# Wait for processes to die
sleep 1

# 2. Clean up Jack shared memory and sockets
echo ""
echo "2. Cleaning up Jack shared memory..."
rm -rf /dev/shm/jack* 2>/dev/null && echo "  ✓ Removed Jack shared memory"
rm -rf /tmp/jack* 2>/dev/null && echo "  ✓ Removed Jack temp files"
rm -rf ~/.jack* 2>/dev/null && echo "  ✓ Removed Jack user files"

# 3. Clean up any suspended jobs
echo ""
echo "3. Checking for suspended jobs..."
if jobs -l | grep -q "Stopped"; then
    echo "  ⚠ Found suspended jobs - please run: jobs -l"
    echo "  Then kill them with: kill %1 %2 etc."
else
    echo "  ✓ No suspended jobs"
fi

echo ""
echo "======================================"
echo "✅ Cleanup complete!"
echo ""
echo "To restart:"
echo "  1. Start Jack:      jackd -d coreaudio -r 44100 -p 256 &"
echo "  2. Start Stromboli: cd server && python main.py"
echo ""

