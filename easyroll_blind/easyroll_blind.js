const axios = require("axios");
const mqtt = require("mqtt");
const fs = require("fs");
const logger = require("simple-node-logger").createSimpleLogger();
const options = require("/data/options.json");

const stateUrl = "http://{}:20318/lstinfo";
const actionUrl = "http://{}:20318/action";

const command = {
    OPEN: "TU",
    CLOSE: "BD",
    STOP: "SS"
};

class EasyrollBlind {
    constructor() {
        this.mqttClient = this.mqttClient();
        this.previousState = {};
        this.clearTimeInterval = false;
        this.timeInterval = null;

        this.requestSmartBlindState();
    }

    mqttClient() {
        const mqttOptions = {
            host: options.mqtt[0].server,
            port: options.mqtt[0].port,
            username: options.mqtt[0].user,
            password: options.mqtt[0].passwd,
        }
        if (options.mqtt_ssl) {
            mqttOptions.protocol = 'mqtts';
            mqttOptions.ca = [fs.readFileSync(options.mqtt_ssl_certificate[0].ca_path)];
            mqttOptions.cert = fs.readFileSync(options.mqtt_ssl_certificate[0].cert_path);
            mqttOptions.key = fs.readFileSync(options.mqtt_ssl_certificate[0].key_path);
            mqttOptions.rejectUnauthorized = true;
        }
        const client = mqtt.connect(mqttOptions);
        logger.info("initializing MQTT...");

        client.on("connect", () => {
            logger.info("MQTT connection successful!");

            const topic = "easyroll/+/+/+/command";
            logger.info("Subscribe: " + topic);

            client.subscribe(topic);
        });

        client.on("error", (err) => {
            logger.error("MQTT connection error: " + err);
        });

        client.on("reconnect", () => {
            logger.warn("MQTT connection lost. trying to reconnect...");
        });

        client.on("message", this.mqttCommand.bind(this));

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
        const self = this;
        async function makeRequest(url, smartBlindId) {
            try {
                const response = await axios.get(url);

                self.handleResponse("initial", response.data, smartBlindId);
                setInterval(() => {
                    self.handleResponse(null, response.data, smartBlindId);
                }, options.scan_interval * 1000);
            } catch (error) {
                logger.error(`The smart blind seems to be offline. Please check the blinds [Error: ${error}]`);
            };
        }

        const smartBlinds = this.findSmartBlinds();

        for (const smartBlind of smartBlinds) {
            const { id, address } = smartBlind;
            await makeRequest(stateUrl.replace("{}", address), id);
        }
    }

    handleResponse(timeInterval, body, smartBlindId) {
        if (body.result !== "success") {
            logger.error(`Smart blind (${smartBlindId}) latest status inquiry error [Result: ${body.result}]`);
            return;
        }

        const smartBlindState = {
            serialNumber: body.serial_number.toLowerCase(),
            index: smartBlindId,
            ip: body.local_ip,
            position: Math.round(body.position),
        };

        if (timeInterval === "initial") {
            logger.info(`Smart blind (${smartBlindId}) latest status inquiry success! [${body.serial_number}:${body.local_ip}]`);
            this.discoverSmartBlind(smartBlindState);
        } else {
            logger.info(`Update smart blind (${smartBlindId}) position: ${smartBlindState.position}%`);
        }

        this.parseSmartBlindState(undefined, smartBlindState);
    }

    async requestSmartBlindPoll(url, smartBlindId, target) {
        const self = this;
        try {
            const response = await axios.get(url);

            if (response.data.result !== "success") {
                logger.error(`Smart blind (${smartBlindId}) latest status inquiry error [Result: ${response.data.result}]`);
                return;
            }

            const smartBlindState = {
                serialNumber: response.data.serial_number.toLowerCase(),
                index: smartBlindId,
                ip: response.data.local_ip,
                position: Math.round(response.data.position),
                property: ["OPEN", "CLOSE", "STOP"].includes(target) ? Math.round(response.data.position) !== 0 && Math.round(response.data.position) !== 100 : Math.round(response.data.position) != target
            };
            self.parseSmartBlindState(self.mqttDict, smartBlindState);

            if (smartBlindState.position == target ||
                smartBlindState.position === (target === "OPEN" ? 0 : 100) ||
                target === "STOP"
            ) {
                clearInterval(self.timeInterval);
            }
        } catch (error) {
            logger.error(`Failed to polling smart blind: ${smartBlindId} [Error: ${error}]`);
        }
    }

    async sendSmartBlindCommand(url, data, header, smartBlindId, target) {
        const self = this;
        try {
            const response = await axios.post(url, data, header);

            if (response.data.result !== "success") {
                logger.error(`Smart blind (${smartBlindId}) ${url.body.mode === "general" ? "general operation command" : "percent move command"} error [Result: ${response.data.result}]`);
                return;
            }

            if (target !== null) {
                self.timeInterval = setInterval(async () => {
                    await self.requestSmartBlindPoll(url.replace("action", "lstinfo"), smartBlindId, target);
                }, 1000);
            }
        } catch (error) {
            logger.error(`Failed to ${url.body.mode === "general" ? "general operation command" : "percent move command"} smart blind: ${smartBlindId} [Error: ${error}]`);
        }
    }

    parseSmartBlindState(direction, smartBlindState) {
        if (direction && smartBlindState.property) {
            if (direction === "CLOSE") {
                this.direction = "closing";
            } else if (direction === "OPEN") {
                this.direction = "opening";
            } else if (direction === "STOP") {
                this.direction = "stopped";
            }
        } else {
            if (smartBlindState.position === 0 || smartBlindState.position < 100) {
                this.direction = "open";
            } else if (smartBlindState.position === 100) {
                this.direction = "closed";
            }
        }

        if (this.previousState.serialNumber === smartBlindState.serialNumber &&
            this.previousState.position === smartBlindState.position) {
            return;
        }
        this.previousState = smartBlindState;

        this.updateSmartBlind(smartBlindState);
    }

    updateSmartBlind(smartBlind) {
        const topics = {
            [`easyroll/${smartBlind.index}/${smartBlind.serialNumber}/direction/state`]: this.direction,
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
            uniq_id: `easyroll_${smartBlind.serialNumber}`,
            device: {
                ids: "Smart Blind",
                name: "Smart Blind",
                mf: "Easyroll",
                mdl: "Easyroll Inshade",
                sw: "harwin1/ha-addons/easyroll_blind",
            },
        };
        this.mqttClient.publish(topic, JSON.stringify(payload), { retain: true });

        for (const key of ["M1", "M2", "M3"]) {
            const topic = `homeassistant/button/easyroll_${smartBlind.index}_${key}/${smartBlind.serialNumber}/config`;
            const payload = {
                name: `easyroll_${smartBlind.serialNumber}_${key}`,
                cmd_t: `easyroll/${smartBlind.index}/${smartBlind.serialNumber}/${key}/command`,
                uniq_id: `easyroll_${smartBlind.serialNumber}_${key}`,
                device: {
                    ids: "Smart Blind",
                    name: "Smart Blind",
                    mf: "Easyroll",
                    mdl: "Easyroll Inshade",
                    sw: "harwin1/ha-addons/easyroll_blind"
                }
            };
            this.mqttClient.publish(topic, JSON.stringify(payload), { retain: true });
        }
    }

    mqttCommand(topic, message) {
        const topics = topic.split("/");
        const payload = message.toString();
        const hosts = this.findSmartBlinds();
        const hostDict = [];

        if (topics[0] !== "easyroll") {
            logger.error("Invalid topic prefix: " + topics[0]);
            return;
        }

        for (const host of hosts) {
            const { id, address } = host;
            if (id == topics[1]) {
                hostDict.push(id, actionUrl.replace("{}", address));
            }
        }
        logger.info(`Received message: ${topic} = ${payload}`);

        if (topics[3] === "direction") {
            this.mqttDict = payload;
            this.sendSmartBlindCommand(hostDict[1], { "mode": "general", "command": command[payload] }, { headers: { "content-type": "application/json" } }
                , hostDict[0], payload);
        } else if (topics[3] === "position") {
            this.mqttDict = (payload < this.previousState.position ? "OPEN" : "CLOSE");
            this.sendSmartBlindCommand(hostDict[1], { "mode": "level", "command": payload }, { headers: { "content-type": "application/json" } }
                , hostDict[0], payload);
        } else {
            this.sendSmartBlindCommand(hostDict[1], { "mode": "general", "command": topics[3] }, { headers: { "content-type": "application/json" } }
                , hostDict[0], null);
        }
    }
}

new EasyrollBlind();
