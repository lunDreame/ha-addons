#!/bin/bash

share_dir=/share/bestin
srv_dir=$share_dir/srv

create_dir_if_not_exists() {
    if [ ! -d "$1" ]; then
        mkdir -p "$1"
        echo "INFO: Created directory '$1'."
    fi
}

copy_file() {
    if [ -f "/$1" ]; then
        cp -f "/$1" "$2"
        echo "INFO: Copied '$1' to '$2'."
    else
        echo "WARNING: File '$1' not found."
    fi
}

create_dir_if_not_exists "$share_dir"
create_dir_if_not_exists "$srv_dir"

copy_file "bestin.js" "$share_dir"
copy_file "const.js" "$srv_dir"
copy_file "logger.js" "$srv_dir"

if [ -f "$share_dir/bestin.js" ]; then
    echo "INFO: 'bestin.js' copied successfully."
    echo "INFO: Starting HDC BESTIN Wallpad Add-on..."
    cd "$share_dir"
    node bestin.js
else
    echo "ERROR: Failed to copy 'bestin.js' to $share_dir"
    exit 1
fi