#!/bin/sh

SHARE_DIR=/share/easyroll

if [ ! -f $SHARE_DIR/smart_blind.js ]; then
    mkdir -p $SHARE_DIR
    mv /smart_blind.js $SHARE_DIR
fi

echo "Running easyroll smart blind addon..."
cd $SHARE_DIR
node smart_blind.js
