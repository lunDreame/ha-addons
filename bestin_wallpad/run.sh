#!/bin/sh

share_dir=/share/bestin
srv_dir=$share_dir/srv

copy_file() {
    if [ -f "/$1" ]; then
        cp -f "/$1" "$share_dir"
    else
        echo "WARNING: '$1' not found."
    fi
}

copy_file_to_srv() {
    if [ -f "/$1" ]; then
        cp -f "/$1" "$srv_dir"
    else
        echo "WARNING: '$1' not found."
    fi
}

run_node() {
    echo "INFO: Starting HDC BESTIN Wallpad Add-on..."
    cd "$share_dir"
    node bestin.js
}

# Copy updated *.js files
copy_file "bestin.js"
copy_file_to_srv "const.js"
copy_file_to_srv "logger.js"

if [ -f "$share_dir/bestin.js" ]; then
    run_node
else
    echo "ERROR: Failed to copy 'bestin.js' to $share_dir"
    exit 1
fi
