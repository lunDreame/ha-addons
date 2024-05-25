#!/bin/sh

share_dir="/share/bestin"
srv_dir="$share_dir/srv"

copy_file() {
    if [ ! -f "$share_dir/$1" ]; then
        mkdir -p "$share_dir"
        mv "/$1" "$share_dir"
    else
        mv -f "/$1" "$share_dir"
    fi
}

copy_file_to_srv() {
    if [ ! -f "$srv_dir/$1" ]; then
        mkdir -p "$srv_dir"
        mv "/$1" "$srv_dir"
    else
        mv -f "/$1" "$srv_dir"
    fi
}

run_node() {
    cd "$share_dir"
    node bestin.js
}

copy_file "bestin.js"
copy_file_to_srv "const.js"
copy_file_to_srv "logger.js"

if [ -f "$share_dir/bestin.js" ]; then
    run_node
else
    exit 1
fi
