const V1LOGIN = {
    "url": `http://{0}/webapp/data/getLoginWebApp.php`,
    "method": "GET",
    "params": {
        "device": "WA",
        "login_ide": "{1}",
        "login_pwd": "{2}",
    }
};

const V2LOGIN = {
    "url": "https://center.hdc-smart.com/v3/auth/login",
    "method": "POST",
    "headers": {
        "content-type": "application/json",
        "authorization": "{0}",
        "user-agent": "mozilla/5.0 (windows nt 10.0; win64; x64) applewebkit/537.36 (khtml, like gecko) chrome/78.0.3904.70 safari/537.36"
    }
};

const V1LIGHTSTATUS = {
    "url": `http://{0}/webapp/data/getHomeDevice.php`,
    "method": "GET",
    "headers": {
        "user-agent": "Mozilla/5.0",
        "cookie": "PHPSESSID={1}; user_id={2}; user_name={3}"
    },
    "params": {
        "req_name": "remote_access_livinglight",
        "req_action": "status"
    }
};

const V2LIGHTSTATUS = {
    "url": "{0}/v2/api/features/{1}/1/apply",
    "method": "GET",
    "headers": {
        "User-Agent": "Mozilla/5.0",
        "access-token": "{2}"
    }
};

const V1LIGHTCMD = {
    "url": `http://{0}/webapp/data/getHomeDevice.php`,
    "method": "GET",
    "headers": {
        "accept": "application/xml",
        "user-agent": "Mozilla/5.0",
        "cookie": "PHPSESSID={1}; user_id={2}; user_name={3}"
    },
    "params": {
        "req_name": "remote_access_livinglight",
        "req_action": "control",
        "req_unit_num": "{4}",
        "req_ctrl_action": "{5}"
    }
};

const V2LIGHTCMD = {
    "url": "{0}/v2/api/features/livinglight/{1}/apply",
    "method": "PUT",
    "data": {
        "unit": "{2}",
        "state": "{3}"
    },
    "headers": {
        "access-token": "{4}",
        "accept": "application/json",
        "user-agent": "Mozilla/5.0"
    }
};

const V2SLIGHTCMD = {
    "url": "{0}/v2/api/features/smartlight/1/apply",
    "method": "PUT",
    "data": "{1}",
    "headers": {
        "access-token": "{2}",
        "accept": "application/json",
        "user-agent": "Mozilla/5.0"
    }
};

const V2ELEVATORCMD = {
    "url": "{0}/v2/admin/elevators/home/apply",
    "method": "POST",
    "data": { "address": "{1}", "direction": "down" },
    "headers": {
        "content-type": "application/json",
        "authorization": "{2}",
        "user-agent": "mozilla/5.0 (windows nt 10.0; win64; x64) applewebkit/537.36 (khtml, like gecko) chrome/78.0.3904.70 safari/537.36"
    }
};

const VENTTEMP = {
    "low": 0x01,
    "medium": 0x02,
    "high": 0x03
};
const VENTTEMPI = {
    0x01: "low",
    0x02: "medium",
    0x03: "high"
};

const ONOFFDEV = {
    "gas": "off",
    "doorlock": "on",
    "lightbatch": "on"
};

const DISCOVERY_DEVICE = {
    "ids": ["bestin_wallpad"],
    "name": "bestin_wallpad",
    "mf": "HDC BESTIN",
    "mdl": "Bestin Wallpad",
    "sw": "harwin1/ha-addons/bestin_wallpad",
};

const DISCOVERY_PAYLOAD = {
    "light": [{
        "_intg": "light",
        "~": "{prefix}/light/{room}/{index}",
        "name": "{prefix}_light_{room}_{index}",
        "cmd_t": "~/command",
        "stat_t": "~/state",
        "pl_on": "on",
        "pl_off": "off",
    }],
    "lightDimming": [{
        "_intg": "light",
        "~": "{prefix}/light/{room}",
        "name": "{prefix}_light_{room}_1",
        "cmd_t": "~/switch1/command",
        "stat_t": "~/switch1/state",
        "bri_scl": 10,
        "bri_cmd_t": "~/dimming/command",
        "bri_stat_t": "~/dimming/state",
        "clr_temp_cmd_t": "~/color/command",
        "clr_temp_stat_t": "~/color/state",
        "pl_on": "on",
        "pl_off": "off",
    }],
    "lightCutoff": [{
        "_intg": "button",
        "~": "{prefix}/light/all/cutoff",
        "name": "{prefix}_lightbreak",
        "cmd_t": "~/command",
    }],
    "outlet": [{
        "_intg": "",
        "~": "{prefix}/outlet/{room}/{index}",
        "name": "{prefix}_outlet_{room}_{index}",
        "cmd_t": "~/command",
        "stat_t": "~/state",
        "pl_on": "on",
        "pl_off": "off",
        "icon": ""
    }],
    "gas": [{
        "_intg": "",
        "~": "{prefix}/gas/{room}/{index}",
        "name": "{prefix}_gas_{index}",
        "cmd_t": "~/command",
        "stat_t": "~/state",
        "pl_on": "on",
        "pl_off": "off",
        "icon": "mdi:gas-cylinder"
    }],
    "fan": [{
        "_intg": "fan",
        "~": "{prefix}/fan/{room}",
        "name": "{prefix}_fan",
        "cmd_t": "~/power/command",
        "stat_t": "~/power/state",
        "pr_mode_cmd_t": "~/preset/command",
        "pr_mode_stat_t": "~/preset/state",
        "pr_modes": ["low", "medium", "high", "nature"],
        "pl_on": "on",
        "pl_off": "off",
    }],
    "thermostat": [{
        "_intg": "climate",
        "~": "{prefix}/thermostat/{room}",
        "name": "{prefix}_thermostat_{room}",
        "mode_cmd_t": "~/power/command",
        "mode_stat_t": "~/power/state",
        "temp_cmd_t": "~/target/command",
        "temp_stat_t": "~/target/state",
        "curr_temp_t": "~/current/state",
        "modes": ["off", "heat"],
        "min_temp": 5,
        "max_temp": 40,
        "temp_step": 0.5,
    }],
    "energy": [{
        "_intg": "sensor",
        "~": "{prefix}/energy/{room}/{index}",
        "name": "{prefix}_{room}_{index}_consumption",
        "stat_t": "~/state",
        "unit_of_meas": ""
    }],
    "doorlock": [{
        "_intg": "switch",
        "~": "{prefix}/doorlock/{room}/{index}",
        "name": "{prefix}_doorlock",
        "cmd_t": "~/command",
        "stat_t": "~/state",
        "pl_on": "on",
        "pl_off": "off",
        "icon": "mdi:lock"
    }],
    "elevator": [{
        "_intg": "",
        "~": "{prefix}/elevator/{room}/{index}",
        "name": "{prefix}_ev{index}_srv",
        "cmd_t": "~/command",
        "stat_t": "~/state",
        "pl_on": "on",
        "pl_off": "off",
        "icon": "mdi:elevator"
    }]
};

module.exports = {
    V1LOGIN,
    V2LOGIN,
    V1LIGHTSTATUS,
    V2LIGHTSTATUS,
    V1LIGHTCMD,
    V2LIGHTCMD,
    V2SLIGHTCMD,
    V2ELEVATORCMD,
    VENTTEMP,
    VENTTEMPI,
    ONOFFDEV,
    DISCOVERY_DEVICE,
    DISCOVERY_PAYLOAD
};