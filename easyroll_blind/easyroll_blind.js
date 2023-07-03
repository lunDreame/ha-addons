const request = require('request');
const mqtt = require('mqtt');
const logger = require('simple-node-logger').createSimpleLogger();
const options = require('/data/options.json');

let mqttConnected = false;

let mqttDict = '';
let previousState = {};

const stateUrl = 'http://{}:20318/lstinfo';
const actionUrl = 'http://{}:20318/action';

const command = {
    OPEN: 'TU',
    CLOSE: 'BD',
    STOP: 'SS',
    memory1: 'M1',
    memory2: 'M2',
    memory3: 'M3',
};

const client = mqtt.connect({
    host: options.mqtt[0].server,
    port: options.mqtt[0].port,
    username: options.mqtt[0].user || null,
    password: options.mqtt[0].passwd || null,
});
logger.info('Initializing MQTT...');

client.on('connect', () => {
    logger.info('MQTT connection successful!');
    mqttConnected = true;

    const topic = 'easyroll/+/+/+/command';
    logger.info(`Subscribing to ${topic}`);
    client.subscribe(topic);
});

client.on('error', (err) => {
    logger.error(`MQTT connection error: ${err}`);
    mqttConnected = false;
});

client.on('reconnect', () => {
    logger.warn('MQTT connection lost. Trying to reconnect...');
});

function findSmartBlinds() {
    const smartBlinds = [];
    for (const [id, address] of Object.entries(options.blind)) {
        const smartBlind = {
            id: Number(id) + 1,
            address: address.toString(),
        };
        smartBlinds.push(smartBlind);
    }
    return smartBlinds;
}

function requestSmartBlindState(timeInterval) {
    function handleResponse(body, smartBlindId) {
        try {
            const state = JSON.parse(body);

            if (state.result !== 'success') {
                logger.error(`Smart blind (${smartBlindId}) state error: ${state.result}`);
            }

            const smartBlindState = {
                serialNumber: state.serial_number.toLowerCase(),
                index: smartBlindId,
                ip: state.local_ip,
                position: Number(Math.round(state.position)),
            };

            if (timeInterval === 'early') {
                logger.info(`Smart blind (${smartBlindId}) state request success! [${state.serial_number}:${state.local_ip}]`);
                discoverSmartBlind(smartBlindState);
            } else {
                logger.info(`Update smart blind (${smartBlindId}) position: ${Number(Math.floor(state.position))}%`);
            }

            parseSmartBlindState(smartBlindState);
        } catch (error) {
            logger.error(`Smart blind (${smartBlindId}) state request failed! (${error})`);
        }
    }

    function makeRequest(url, smartBlindId) {
        request.get(url, function (error, response, body) {
            handleResponse(body, smartBlindId);
        });
    }

    const smartBlinds = findSmartBlinds();

    for (const smartBlind of smartBlinds) {
        const { id, address } = smartBlind;
        makeRequest(stateUrl.replace('{}', address), id);
    }
}

requestSmartBlindState('early');
setInterval(requestSmartBlindState, options.scan_interval * 1000, null);

function requestSmartBlindPoll(url, smartBlindId) {
    request.get(url, function (error, response, body) {
        try {
            const state = JSON.parse(body);

            if (state.result !== 'success') {
                logger.error(`Smart blind (${smartBlindId}) polling error: ${state.result}`);
            }
            //logger.info(`Smart blind (${smartBlindId}) polling request success!`);

            const smartBlindState = {
                serialNumber: state.serial_number.toLowerCase(),
                index: smartBlindId,
                ip: state.local_ip,
                position: Number(Math.round(state.position)),
            };

            parseSmartBlindState(smartBlindState);
        } catch (error) {
            logger.error(`Smart blind (${smartBlindId}) polling request failed! (${error})`);
        }
    });
}

function sendSmartBlindCommand(url, smartBlindId) {
    request.post(url, function (error, response, body) {
        try {
            const state = JSON.parse(body);

            if (state.result !== 'success') {
                logger.error(`Smart blind (${smartBlindId}) command error: ${state.result}`);
            }
            logger.info(`Smart blind (${smartBlindId}) command request success!`);

            const interval = setInterval(requestSmartBlindPoll, 1000, url.url.replace('action', 'lstinfo'), smartBlindId);
            setTimeout(() => {
                clearInterval(interval);
            }, options.command_interval * 1000);
        } catch (error) {
            logger.error(`Smart blind (${smartBlindId}) command request failed! (${error})`);
        }
    });
}

function parseSmartBlindState(smartBlindState) {
    let action = '';
    if (smartBlindState.position !== 0 && smartBlindState.position !== 100 && mqttDict) {
        if (mqttDict === 'CLOSE') {
            action = 'closing';
        } else if (mqttDict === 'OPEN') {
            action = 'opening';
        } else if (mqttDict === 'STOP') {
            action = 'stopped';
        }
    } else {
        if (smartBlindState.position === 0 || smartBlindState.position < 100) {
            action = 'open';
        } else if (smartBlindState.position === 100) {
            action = 'closed';
        }
    }

    if (previousState === '{}') {
        previousState = smartBlindState;
    }
    if (
        previousState.serialNumber === smartBlindState.serialNumber &&
        previousState.position === smartBlindState.position
    ) {
        return;
    }
    previousState = smartBlindState;
    updateSmartBlind(action, smartBlindState);
}

function updateSmartBlind(action, state) {
    const topics = {
        [`easyroll/${state.index}/${state.serialNumber}/position/state`]: action,
        [`easyroll/${state.index}/${state.serialNumber}/percent/state`]: state.position,
    };

    for (const [topic, payload] of Object.entries(topics)) {
        client.publish(topic, String(payload));
        logger.info(`Publishing to MQTT: ${topic} = ${payload}`);
    }
}

function discoverSmartBlind(state) {
    const coverTopic = `homeassistant/cover/easyroll_${state.index}/${state.serialNumber}/config`;
    const coverPayload = {
        name: `easyroll_${state.serialNumber}`,
        cmd_t: `easyroll/${state.index}/${state.serialNumber}/mode/command`,
        stat_t: `easyroll/${state.index}/${state.serialNumber}/position/state`,
        pos_t: `easyroll/${state.index}/${state.serialNumber}/percent/state`,
        set_pos_t: `easyroll/${state.index}/${state.serialNumber}/percent/command`,
        pos_open: 0,
        pos_clsd: 100,
        uniq_id: `easyroll_${state.serialNumber}`,
        device: {
            ids: 'Smart Blind',
            name: 'Smart Blind',
            mf: 'Easyroll',
            mdl: 'Easyroll Inshade',
            sw: 'harwin1/ha-addons/easyroll_blind',
        },
    };
    client.publish(coverTopic, JSON.stringify(coverPayload));

    const memoryMap = ['memory1', 'memory2', 'memory3'];
    for (const memory of memoryMap) {
        const buttonTopic = `homeassistant/button/easyroll_${state.index}_${memory}/${state.serialNumber}/config`;
        const buttonPayload = {
            name: `easyroll_${state.serialNumber}_${memory}`,
            cmd_t: `easyroll/${state.index}/${state.serialNumber}/${memory}/command`,
            uniq_id: `easyroll_${state.serialNumber}_${memory}`,
            device: {
                ids: 'Smart Blind',
                name: 'Smart Blind',
                mf: 'Easyroll',
                mdl: 'Easyroll Inshade',
                sw: 'harwin1/ha-addons/easyroll_blind',
            },
        };
        client.publish(buttonTopic, JSON.stringify(buttonPayload));
    }
}

client.on('message', (topic, message) => {
    const topics = topic.split('/');
    const payload = message.toString();
    const hosts = findSmartBlinds();
    const hostDict = [];

    if (topics[0] !== 'easyroll') {
        logger.error(`Invalid topic prefix: ${topics[0]}`);
        return;
    }

    for (const host of hosts) {
        const { id, address } = host;
        if (id == topics[1]) {
            hostDict.push(id, actionUrl.replace('{}', address));
        }
    }
    logger.info(`Received message: ${topic} = ${payload}`);

    if (topics[3] === 'mode') {
        mqttDict = payload;
        const params = {
            url: hostDict[1],
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ mode: 'general', command: command[payload] }),
        };
        sendSmartBlindCommand(params, hostDict[0]);
    } else if (topics[3] === 'percent') {
        const params = {
            url: hostDict[1],
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ mode: 'level', command: payload }),
        };
        sendSmartBlindCommand(params, hostDict[0]);
    } else {
        const params = {
            url: hostDict[1],
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ mode: 'general', command: command[topics[3]] }),
        };
        sendSmartBlindCommand(params, hostDict[0]);
    }
});
