#!/bin/bash
ASSISTIVE_BASE=/tmp/queue-arcade-launch-checks/assistive
export PATH="$ASSISTIVE_BASE/root/usr/bin:$PATH"
export LD_LIBRARY_PATH="$ASSISTIVE_BASE/root/lib/x86_64-linux-gnu:$ASSISTIVE_BASE/root/usr/lib/x86_64-linux-gnu:$ASSISTIVE_BASE/root/usr/lib"
export GI_TYPELIB_PATH="$ASSISTIVE_BASE/root/usr/lib/x86_64-linux-gnu/girepository-1.0"
export PYTHONPATH="$ASSISTIVE_BASE/root/usr/lib/python3/dist-packages"
export XDG_CONFIG_HOME="$ASSISTIVE_BASE/session/config"
export XDG_DATA_HOME="$ASSISTIVE_BASE/session/data"
export XDG_CACHE_HOME="$ASSISTIVE_BASE/session/cache"
export XDG_RUNTIME_DIR="$ASSISTIVE_BASE/session/runtime"
export XDG_DATA_DIRS="$ASSISTIVE_BASE/root/usr/share:/usr/local/share:/usr/share"
export GSETTINGS_BACKEND=memory
export ESPEAK_DATA_PATH="$ASSISTIVE_BASE/root/usr/lib/x86_64-linux-gnu"
export SPEECHD_ADDRESS="unix_socket:$ASSISTIVE_BASE/session/runtime/speechd.sock"
export GTK_MODULES="$ASSISTIVE_BASE/root/usr/lib/x86_64-linux-gnu/gtk-2.0/modules/libatk-bridge.so"
export NO_AT_BRIDGE=0
mkdir -p "$XDG_CONFIG_HOME" "$XDG_DATA_HOME" "$XDG_CACHE_HOME" "$XDG_RUNTIME_DIR"
chmod 700 "$XDG_RUNTIME_DIR"
export LTDL_LIBRARY_PATH="$ASSISTIVE_BASE/root/usr/lib/x86_64-linux-gnu/speech-dispatcher"
