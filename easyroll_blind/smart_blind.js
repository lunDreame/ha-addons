const axios = require('axios');
const mqtt = require('mqtt');
const fs = require('fs');
const logger = require('simple-node-logger').createSimpleLogger();
const options = require('/data/options.json');

const stateUrl = 'http://{}:20318/lstinfo';
const actionUrl = 'http://{}:20318/action';

const command = {
    OPEN: 'TU',
    CLOSE: 'BD',
    STOP: 'SS',
};

class SmartBlind {
    constructor() {
        this.mqttClient = this.mqttClient();
        this.mqttConnected = false;
        this.mqttPreviousState = {};
        this.blindStateInterval = null;
        this.blindStateFuncCount = 0;
        this.blindPollInterval = null;
    }

    mqttClient() {
        const mqttOptions = {
            host: options.mqtt[0].server,
            port: options.mqtt[0].port,
            username: options.mqtt[0].user || null,
            password: options.mqtt[0].passwd || null,
        }
        if (options.mqtt_ssl) {
            mqttOptions.protocol = 'mqtts';
            mqttOptions.ca = [fs.readFileSync(options.mqtt_ssl_certificate[0].ca_path)];
            mqttOptions.cert = fs.readFileSync(options.mqtt_ssl_certificate[0].cert_path);
            mqttOptions.key = fs.readFileSync(options.mqtt_ssl_certificate[0].key_path);
            mqttOptions.rejectUnauthorized = true;
        }
        const client = mqtt.connect(mqttOptions);
        logger.info('initializing MQTT...');

        client.on('connect', () => {
            logger.info('MQTT connection successful!');
            this.mqttConnected = true;

            const topic = 'easyroll/+/+/+/command';
            logger.info('Subscribe: ' + topic);

            client.subscribe(topic);

            this.requestSmartBlindState();
        });

        client.on('error', (err) => {
            this.mqttConnected = false;

            logger.error('MQTT connection error: ' + err);
        });

        client.on('reconnect', () => {
            logger.warn('MQTT connection lost. trying to reconnect...');
        });

        client.on('message', this.mqttCommand.bind(this));

        return client;
    }

    findSmartBlinds() {
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

    async requestSmartBlindState() {
        const makeRequest = async (url, smartBlindId) => {
            this.blindStateFuncCount++;
            try {
                const response = await axios.get(url);

                this.handleResponse(this.blindStateFuncCount, response.data, smartBlindId);
            } catch (error) {
                logger.error(`The smart blind seems to be offline. Please check the blinds [${error}]`);
            };
        }

        const smartBlinds = this.findSmartBlinds();

        for (const smartBlind of smartBlinds) {
            const { id, address } = smartBlind;
            await makeRequest(stateUrl.replace('{}', address), id);
        }
    }

    startSmartBlindStateRequests() {
        this.blindStateInterval = setInterval(async () => {
            await this.requestSmartBlindState();
        }, options.scan_interval * 1000);

        if (this.mqttConnected === false) {
            clearInterval(this.blindStateInterval);
        }
    }

    handleResponse(timeInterval, body, smartBlindId) {
        if (body.result !== 'success') {
            logger.error(`Smart blind (${smartBlindId}) latest status inquiry error [Result: ${body.result}]`);
            return;
        }

        const smartBlindState = {
            serialNumber: body.serial_number.toLowerCase(),
            index: smartBlindId,
            ip: body.local_ip,
            position: Math.round(body.position),
        };

        if (timeInterval === 1) {
            logger.info(`Smart blind (${smartBlindId}) latest status inquiry success! [${body.serial_number}:${body.local_ip}]`);
            this.startSmartBlindStateRequests();
            this.discoverSmartBlind(smartBlindState);
        } else if (timeInterval > 1) {
            logger.info(`Update smart blind (${smartBlindId}) position: ${smartBlindState.position}%`);
        }

        this.parseSmartBlindState(smartBlindState);
    }

    async requestSmartBlindPoll(url, smartBlindId, target) {
        try {
            const response = await axios.get(url);

            if (response.data.result !== 'success') {
                logger.error(`Smart blind (${smartBlindId}) latest status inquiry error [Result: ${response.data.result}]`);
                return;
            }

            const smartBlindState = {
                serialNumber: response.data.serial_number.toLowerCase(),
                index: smartBlindId,
                ip: response.data.local_ip,
                position: Math.round(response.data.position),
                property: ['OPEN', 'CLOSE', 'STOP'].includes(target) ? Math.round(response.data.position) !== 0 && Math.round(response.data.position) !== 100 : Math.round(response.data.position) != target,
            };
            this.parseSmartBlindState(smartBlindState, this.mqttStateDict);

            if (smartBlindState.position == target ||
                smartBlindState.position === (target === 'OPEN' ? 0 : 100) ||
                target === 'STOP'
            ) {
                clearInterval(this.blindPollInterval);
            }
        } catch (error) {
            logger.error(`Failed to polling smart blind: ${smartBlindId} [${error}]`);
        }
    }

    async sendSmartBlindCommand(url, data, header, smartBlindId, target) {
        try {
            const response = await axios.post(url, data, header);

            if (response.data.result !== 'success') {
                logger.error(`Smart blind (${smartBlindId}) ${url.body.mode === 'general' ? 'general operation command' : 'percent move command'} error [Result: ${response.data.result}]`);
                return;
            }

            if (target) {
                this.blindPollInterval = setInterval(async () => {
                    await this.requestSmartBlindPoll(url.replace('action', 'lstinfo'), smartBlindId, target);
                }, 1000);
            }
        } catch (error) {
            logger.error(`Failed to ${url.body.mode === 'general' ? 'general operation command' : 'percent move command'} smart blind: ${smartBlindId} [${error}]`);
        }
    }

    parseSmartBlindState(smartBlindState, direction) {
        if (direction && smartBlindState.property) {
            if (direction === 'CLOSE') {
                this.blindDirection = 'closing';
            } else if (direction === 'OPEN') {
                this.blindDirection = 'opening';
            } else if (direction === 'STOP') {
                this.blindDirection = 'stopped';
            }
        } else {
            if (smartBlindState.position === 0 || smartBlindState.position < 100) {
                this.blindDirection = 'open';
            } else if (smartBlindState.position === 100) {
                this.blindDirection = 'closed';
            }
        }

        if (this.mqttPreviousState.serialNumber === smartBlindState.serialNumber &&
            this.mqttPreviousState.position === smartBlindState.position) {
            return;
        }
        this.mqttPreviousState = smartBlindState;

        this.updateSmartBlind(smartBlindState);
    }

    updateSmartBlind(smartBlind) {
        const topics = {
            [`easyroll/${smartBlind.index}/${smartBlind.serialNumber}/direction/state`]: this.blindDirection,
            [`easyroll/${smartBlind.index}/${smartBlind.serialNumber}/position/state`]: smartBlind.position.toString(),
        };

        for (const [topic, payload] of Object.entries(topics)) {
            this.mqttClient.publish(topic, payload, { retain: true });
            logger.info(`Publish to MQTT: ${topic} = ${payload}`);
        }
    }

    discoverSmartBlind(smartBlind) {
        const topic = `homeassistant/cover/easyroll_${smartBlind.index}/${smartBlind.serialNumber}/config`;
        const payload = {
            name: `easyroll_${smartBlind.serialNumber}`,
            cmd_t: `easyroll/${smartBlind.index}/${smartBlind.serialNumber}/direction/command`,
            stat_t: `easyroll/${smartBlind.index}/${smartBlind.serialNumber}/direction/state`,
            pos_t: `easyroll/${smartBlind.index}/${smartBlind.serialNumber}/position/state`,
            set_pos_t: `easyroll/${smartBlind.index}/${smartBlind.serialNumber}/position/command`,
            pos_open: 0,
            pos_clsd: 100,
            ic: 'mdi:blinds',
            uniq_id: `easyroll_${smartBlind.serialNumber}`,
            ret: true,
            device: {
                ids: 'Smart Blind',
                name: 'Smart Blind',
                mf: 'EasyRoll',
                mdl: 'EasyRoll Inoshade',
                sw: 'harwin1/ha-addons/easyroll_blind',
            },
        };
        this.mqttClient.publish(topic, JSON.stringify(payload));

        for (const key of ['M1', 'M2', 'M3']) {
            const topic = `homeassistant/button/easyroll_${smartBlind.index}_${key}/${smartBlind.serialNumber}/config`;
            const payload = {
                name: `easyroll_${smartBlind.serialNumber}_${key}`,
                cmd_t: `easyroll/${smartBlind.index}/${smartBlind.serialNumber}/${key}/command`,
                uniq_id: `easyroll_${smartBlind.serialNumber}_${key}`,
                ret: true,
                ic: 'mdi:alpha-m-box',
                device: {
                    ids: 'Smart Blind',
                    name: 'Smart Blind',
                    mf: 'EasyRoll',
                    mdl: 'EasyRoll Inoshade',
                    sw: 'harwin1/ha-addons/easyroll_blind',
                },
            };
            this.mqttClient.publish(topic, JSON.stringify(payload));
        }
    }

    mqttCommand(topic, message) {
        const topics = topic.split('/');
        const payload = message.toString();
        const hosts = this.findSmartBlinds();
        const hostDict = [];

        if (topics[0] !== 'easyroll') {
            logger.error('Invalid topic prefix: ' + topics[0]);
            return;
        }

        for (const host of hosts) {
            const { id, address } = host;
            if (id == topics[1]) {
                hostDict.push(id, actionUrl.replace('{}', address));
            }
        }
        logger.info(`Received message: ${topic} = ${payload}`);

        if (topics[3] === 'direction') {
            this.mqttStateDict = payload;
            this.sendSmartBlindCommand(hostDict[1], { 'mode': 'general', 'command': command[payload] }, { headers: { 'content-type': 'application/json' } }
                , hostDict[0], payload);
        } else if (topics[3] === 'position') {
            this.mqttStateDict = (payload < this.mqttPreviousState.position ? 'OPEN' : 'CLOSE');
            this.sendSmartBlindCommand(hostDict[1], { 'mode': 'level', 'command': payload }, { headers: { 'content-type': 'application/json' } }
                , hostDict[0], payload);
        } else {
            this.sendSmartBlindCommand(hostDict[1], { 'mode': 'general', 'command': topics[3] }, { headers: { 'content-type': 'application/json' } }
                , hostDict[0]);
        }
    }
}

new SmartBlind();
