#!/bin/sh

SHARE_DIR=/share/easyroll

if [ ! -f $SHARE_DIR/smart_blind.py ]; then
	mkdir $SHARE_DIR
	mv /smart_blind.py $SHARE_DIR
fi

echo "running easyroll smart blind addon..."
cd $SHARE_DIR
python3 $SHARE_DIR/smart_blind.py
