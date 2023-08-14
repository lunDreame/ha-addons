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

const HEMSELEM = ["electric", "heat", "hotwater", "gas", "water"];

const HEMSMAP = {
    "electric": [8, 12],
    "heat": [0, 0],
    "hotwater": [0, 0],
    "gas": [32, 35],
    "water": [17, 19]
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
        "~": "{0}/light/{1}/{2}",
        "name": "{0}_light_{1}_{2}",
        "cmd_t": "~/command",
        "stat_t": "~/state",
        "pl_on": "on",
        "pl_off": "off",
        "ret": true,
    }],
    "lightDimming": [{
        "_intg": "light",
        "~": "{0}/light/{1}",
        "name": "{0}_light_{1}_1",
        "cmd_t": "~/switch1/command",
        "stat_t": "~/switch1/state",
        "bri_scl": 10,
        "bri_cmd_t": "~/dimming/command",
        "bri_stat_t": "~/dimming/state",
        "clr_temp_cmd_t": "~/color/command",
        "clr_temp_stat_t": "~/color/state",
        "pl_on": "on",
        "pl_off": "off",
        "ret": true,
    }],
    "outlet": [{
        "_intg": "",
        "~": "{0}/outlet/{1}/{2}",
        "name": "{0}_outlet_{1}_{2}",
        "cmd_t": "~/command",
        "stat_t": "~/state",
        "pl_on": "on",
        "pl_off": "off",
        "icon": "",
        "unit_of_meas": "W",
        "ret": true,
    }],
    "gas": [{
        "_intg": "",
        "~": "{0}/gas/{1}/{2}",
        "name": "{0}_gas_{2}",
        "cmd_t": "~/command",
        "stat_t": "~/state",
        "pl_on": "on",
        "pl_off": "off",
        "icon": "mdi:gas-cylinder",
        "ret": true,
    }],
    "fan": [{
        "_intg": "fan",
        "~": "{0}/fan/{1}",
        "name": "{0}_fan",
        "cmd_t": "~/power/command",
        "stat_t": "~/power/state",
        "pr_mode_cmd_t": "~/preset/command",
        "pr_mode_stat_t": "~/preset/state",
        "pr_modes": ["low", "medium", "high", "nature"],
        "pl_on": "on",
        "pl_off": "off",
        "ret": true,
    }],
    "thermostat": [{
        "_intg": "climate",
        "~": "{0}/thermostat/{1}",
        "name": "{0}_thermostat_{1}",
        "mode_cmd_t": "~/power/command",
        "mode_stat_t": "~/power/state",
        "temp_cmd_t": "~/target/command",
        "temp_stat_t": "~/target/state",
        "curr_temp_t": "~/current/state",
        "modes": ["off", "heat"],
        "min_temp": 5,
        "max_temp": 40,
        "temp_step": 0.5,
        "ret": true,
    }],
    "energy": [{
        "_intg": "sensor",
        "~": "{0}/energy/{1}/{2}",
        "name": "{0}_{1}_{2}_consumption",
        "stat_t": "~/state",
        "unit_of_meas": "",
    }],
    "doorlock": [{
        "_intg": "",
        "~": "{0}/doorlock/{1}/{2}",
        "name": "{0}_doorlock",
        "cmd_t": "~/command",
        "stat_t": "~/state",
        "pl_on": "on",
        "pl_off": "off",
        "icon": "mdi:lock",
        "ret": true,
    }],
    "elevator": [{
        "_intg": "",
        "~": "{0}/elevator/{1}/{2}",
        "name": "{0}_ev{2}_srv{1}",
        "cmd_t": "~/command",
        "stat_t": "~/state",
        "pl_on": "on",
        "pl_off": "off",
        "icon": "mdi:elevator",
    }]
};

String.format = function(formatted) {
    var args = Array.prototype.slice.call(arguments, 1);
    return formatted.replace(/{(\d+)}/g, function(match, number) { 
        return typeof args[number] != 'undefined' ? args[number] : match;
    });
}

function recursiveFormatWithArgs(obj, ...args) {
    const newObj = {};

    Object.keys(obj).forEach(key => {
        const val = obj[key];
        if (typeof val === "object") {
            newObj[key] = recursiveFormatWithArgs(val, ...args);
        } else if (typeof val === "string") {
            newObj[key] = val.replace(/\{(\d+)\}/g, (match, p1) => args[p1]);
        } else {
            newObj[key] = val;
        }
    });

    return newObj;
}

function deepCopyObject(obj) {
    return JSON.parse(JSON.stringify(obj));
}

module.exports = {
    V1LOGIN,
    V2LOGIN,
    V1LIGHTSTATUS,
    V2LIGHTSTATUS,
    V1LIGHTCMD,
    V2LIGHTCMD,
    V2SLIGHTCMD,
    V2ELEVATORCMD,

    HEMSELEM,
    HEMSMAP,
    VENTTEMP,
    VENTTEMPI,
    ONOFFDEV,
    DISCOVERY_DEVICE,
    DISCOVERY_PAYLOAD,

    format: String.format,
    deepCopyObject,
    recursiveFormatWithArgs
};
