const request = require("request");
const mqtt = require("mqtt");
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
        const client = mqtt.connect({
            host: options.mqtt[0].server,
            port: options.mqtt[0].port,
            username: options.mqtt[0].user || null,
            password: options.mqtt[0].passwd || null,
        });
        logger.info("Initializing MQTT...");

        client.on("connect", () => {
            logger.info("MQTT connection successful!");

            const topic = "easyroll/+/+/+/command";
            logger.info(`Subscribing to ${topic}`);

            client.subscribe(topic);
        });

        client.on("error", (err) => {
            logger.error(`MQTT connection error: ${err}`);
        });

        client.on("reconnect", () => {
            logger.warn("MQTT connection lost. Trying to reconnect...");
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

    requestSmartBlindState() {
        const self = this;
        function makeRequest(url, smartBlindId) {
            request.get(url, function (error, response, body) {
                if (error && response.statusCode !== 200) {
                    logger.error(`Smart blind (${smartBlindId}) state request failed! (${error || request.statusCode})`);
                    return;
                }
                self.handleResponse("initial", body, smartBlindId);
                setInterval(() => {
                    self.handleResponse(null, body, smartBlindId);
                }, options.scan_interval * 1000);
            });
        }

        const smartBlinds = this.findSmartBlinds();

        for (const smartBlind of smartBlinds) {
            const { id, address } = smartBlind;
            makeRequest(stateUrl.replace("{}", address), id);
        }
    }

    async handleResponse(timeInterval, body, smartBlindId) {
        try {
            const state = await JSON.parse(body);

            if (state.result !== "success") {
                logger.error(`Smart blind (${smartBlindId}) state error: ${state.result}`);
                return;
            }

            const smartBlindState = {
                serialNumber: state.serial_number.toLowerCase(),
                index: smartBlindId,
                ip: state.local_ip,
                position: Math.round(state.position),
            };

            if (timeInterval === "initial") {
                logger.info(`Smart blind (${smartBlindId}) state request success! [${state.serial_number}:${state.local_ip}]`);
                this.discoverSmartBlind(smartBlindState);
            } else {
                logger.info(`Update smart blind (${smartBlindId}) position: ${smartBlindState.position}%`);
            }

            this.parseSmartBlindState(undefined, smartBlindState);
        } catch (error) {
            logger.error(`Smart blind (${smartBlindId}) state request failed! (${error})`);
        }
    }

    requestSmartBlindPoll(url, smartBlindId, target) {
        const self = this;
        request.get(url, function (error, response, body) {
            try {
                const state = JSON.parse(body);

                if (state.result !== "success") {
                    logger.error(`Smart blind (${smartBlindId}) polling error: ${state.result}`);
                    return;
                }

                const smartBlindState = {
                    serialNumber: state.serial_number.toLowerCase(),
                    index: smartBlindId,
                    ip: state.local_ip,
                    position: Math.round(state.position),
                    property: ["OPEN", "CLOSE", "STOP"].includes(target) ? Math.round(state.position) !== 0 && Math.round(state.position) !== 100 : Math.round(state.position) != target
                };
                self.parseSmartBlindState(self.mqttDict, smartBlindState);

                if (smartBlindState.position == target ||
                    smartBlindState.position === (target === "OPEN" ? 0 : 100) ||
                    target === "STOP"
                ) {
                    clearInterval(self.timeInterval);
                }
            } catch (error) {
                logger.error(`Smart blind (${smartBlindId}) polling request failed! (${error})`);
            }
        });
    }

    sendSmartBlindCommand(url, smartBlindId, target) {
        const self = this;
        request.post(url, function (error, response, body) {
            try {
                const state = JSON.parse(body);

                if (state.result !== "success") {
                    logger.error(`Smart blind (${smartBlindId}) command error: ${state.result}`);
                    return;
                }
                logger.info(`Smart blind (${smartBlindId}) command request success!`);

                if (target !== undefined) {
                    self.timeInterval = setInterval(() => {
                        self.requestSmartBlindPoll(url.url.replace("action", "lstinfo"), smartBlindId, target);
                    }, 1000);
                }
            } catch (error) {
                logger.error(`Smart blind (${smartBlindId}) command request failed! (${error})`);
            }
        });
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
            logger.info(`Publishing to MQTT: ${topic} = ${payload}`);
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

        ["M1", "M2", "M3"].map(M => {
            const topic = `homeassistant/button/easyroll_${smartBlind.index}_${M}/${smartBlind.serialNumber}/config`;
            const payload = {
                name: `easyroll_${smartBlind.serialNumber}_${M}`,
                cmd_t: `easyroll/${smartBlind.index}/${smartBlind.serialNumber}/${M}/command`,
                uniq_id: `easyroll_${smartBlind.serialNumber}_${M}`,
                device: {
                    ids: "Smart Blind",
                    name: "Smart Blind",
                    mf: "Easyroll",
                    mdl: "Easyroll Inshade",
                    sw: "harwin1/ha-addons/easyroll_blind"
                }
            };
            this.mqttClient.publish(topic, JSON.stringify(payload), { retain: true });
        });
    }

    mqttCommand(topic, message) {
        const topics = topic.split("/");
        const payload = message.toString();
        const hosts = this.findSmartBlinds();
        const hostDict = [];

        if (topics[0] !== "easyroll") {
            logger.error(`Invalid topic prefix: ${topics[0]}`);
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
            const params = {
                url: hostDict[1],
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ mode: "general", command: command[payload] }),
            };
            this.sendSmartBlindCommand(params, hostDict[0], payload);
        } else if (topics[3] === "position") {
            this.mqttDict = (payload < this.previousState.position ? "OPEN" : "CLOSE");
            const params = {
                url: hostDict[1],
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ mode: "level", command: payload }),
            };
            this.sendSmartBlindCommand(params, hostDict[0], payload);
        } else {
            const params = {
                url: hostDict[1],
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ mode: "general", command: topics[3] }),
            };
            this.sendSmartBlindCommand(params, hostDict[0], undefined);
        }
    }
}

new EasyrollBlind();
