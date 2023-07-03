#!/bin/sh

SHARE_DIR=/share/bestin

if [ ! -f $SHARE_DIR/bestin_infancy.js ]; then
    mkdir -p $SHARE_DIR
    mv /bestin_infancy.js $SHARE_DIR
fi

echo "INFO: Running HDC Infancy BESTIN WallPad RS485 Addon..."
cd $SHARE_DIR
node bestin_infancy.js
