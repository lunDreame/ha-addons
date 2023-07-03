#!/bin/sh

SHARE_DIR=/share/easyroll

if [ ! -f $SHARE_DIR/easyroll_blind.js ]; then
    mkdir -p $SHARE_DIR
    mv /easyroll_blind.js $SHARE_DIR
fi

echo "running easyroll smart blind addon..."
cd $SHARE_DIR
node easyroll_blind.js
