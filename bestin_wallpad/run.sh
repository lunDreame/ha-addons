#!/bin/sh

share_dir=/share/bestin
srv_dir=$share_dir/srv

copy_file() {
    if [ ! -f "$share_dir/$1" ]; then
        mkdir -p "$share_dir"
        mv "/$1" "$share_dir"
    fi
}

copy_file_to_srv() {
    if [ ! -f "$srv_dir/$1" ]; then
        mkdir -p "$srv_dir"
        mv "/$1" "$srv_dir"
    fi
}

run_node() {
    echo "INFO: Running HDC BESTIN WallPad RS485 Addon..."
    cd "$share_dir"
    node bestin.js
}

copy_file "bestin.js"
copy_file_to_srv "const.js"
copy_file_to_srv "logger.js"

if [ -f "$share_dir/bestin.js" ]; then
    run_node
else
    echo "ERROR: Failed to copy 'bestin.js' to $share_dir"
    exit 1
fi
