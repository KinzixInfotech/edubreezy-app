#!/bin/bash
# Script to comment out individual StatusBar components (keep the global one in _layout.js)

# List of files to remove StatusBar from (excluding _layout.js which has the global one)
files=(
  "app/(auth)/schoolcode.js"
  "app/(screens)/transport/driver-dashboard.js"
  "app/(screens)/transport/transport-login.js"
  "app/(screens)/transport/active-trip.js"
  "app/(screens)/transport/attendance-marking.js"
  "app/(screens)/transport/conductor-dashboard.js"
  "app/(screens)/notification.js"
  "app/(screens)/greeting.js"
)

for file in "${files[@]}"; do
  if [ -f "$file" ]; then
    echo "Processing: $file"
    # Comment out StatusBar lines (both self-closing and with props)
    sed -i '' 's/<StatusBar[^>]*\/>/\{\/\* StatusBar removed - using global \*\/\}/g' "$file"
  fi
done

echo "Done! StatusBar components commented out."
