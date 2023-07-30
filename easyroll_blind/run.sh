#!/bin/sh

SHARE_DIR=/share/easyroll
TEMP_FILE=temp_easyroll_blind.js

if [ ! -f $SHARE_DIR/easyroll_blind.js ]; then
    mkdir -p $SHARE_DIR
    mv /easyroll_blind.js $SHARE_DIR
fi

# Check if the file has the comment /** edited */ at the top
if head -n 1 $SHARE_DIR/easyroll_blind.js | grep -q '/** edited */'; then
    echo "File has /** edited */ comment, keeping the existing file."
    rm -f $TEMP_FILE
else
    echo "File does not have /** edited */ comment, overwriting the existing file."
    mv $SHARE_DIR/easyroll_blind.js $TEMP_FILE
fi

# Copy the new content to the shared directory
cp /easyroll_blind.js $SHARE_DIR

echo "Running easyroll smart blind addon..."
cd $SHARE_DIR
node easyroll_blind.js
