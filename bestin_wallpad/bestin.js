/*
 * @description bestin.js
 * @author harwin1
 */

const logger = require("./srv/logger.js");
const options = require("/data/options.json");

const { SerialPort } = require("serialport");
const { Transform } = require("stream");

const mqtt = require("mqtt");
const net = require("net");
const fs = require("fs");

////////////////////////////////
const axios = require("axios");
const EventSource = require("eventsource");
const xml2js = require("xml2js");

const {
    VENTTEMP,
    VENTTEMPI,
    ONOFFDEV,
    DISCOVERY_DEVICE,
    DISCOVERY_PAYLOAD,

    V1LOGIN,
    V2LOGIN,
    V1LIGHTSTATUS,
    V2LIGHTSTATUS,
    V1LIGHTCMD,
    V2LIGHTCMD,
    V2SLIGHTCMD,
    V2ELEVATORCMD
} = require("./srv/const.js");

const MSG_INFO = [
    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    ///////////////////////////////////////////////// 명령

    // 조명
    {
        device: "light", header: "02310D01", length: 13, request: "set",
        setPropertyToMsg: (b, i, n, v) => {
            let id = n.slice(-1) - 1, pos = (v === "on" ? 0x80 : 0x00), onff = (v === "on" ? 0x04 : 0x00);

            b[5] = i & 0x0F;
            if (n === "all") b[6] = (v === "on" ? 0x8F : 0x0F);
            else b[6] = (0x01 << id | pos);
            b[11] = onff;
            return b;
        }
    },

    // 콘센트
    {
        device: "outlet", header: "02310D01", length: 13, request: "set",
        setPropertyToMsg: (b, i, n, v) => {
            let id = n.slice(-1) - 1, pos = (v === "on" ? 0x80 : 0x00), onff = (v === "on" ? 0x09 << id : 0x00);

            b[5] = i & 0x0F;
            if (n === "standby") b[8] = (v === "on" ? 0x83 : 0x03);
            else if (n === "all") b[7] = (v === "on" ? 0x8F : 0x0F), b[11] = onff;
            else b[7] = (0x01 << id | pos), b[11] = onff;
            return b;
        }
    },

    // 난방
    {
        device: "thermostat", header: "02280E12", length: 14, request: "set",
        setPropertyToMsg: (b, i, n, v) => {
            let val = parseFloat(v), vInt = parseInt(val), vFloat = val - vInt;

            b[5] = i & 0x0F;
            if (n === "power") b[6] = (v === "heat" ? 0x01 : 0x02);
            else b[7] = ((vInt & 0xFF) | ((vFloat != 0) ? 0x40 : 0x00));
            return b;
        }
    },

    // 환기
    {
        device: "fan", header: "026100", length: 10, request: "set",
        setPropertyToMsg: (b, i, n, v) => {
            if (n === "power") b[2] = 0x01, b[5] = (v === "on" ? 0x01 : 0x00), b[6] = 0x01;
            else b[2] = (v === "nature" ? 0x07 : 0x03), b[6] = VENTTEMP[v];
            return b;
        }
    },

    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    ///////////////////////////////////////////////// 상태

    // 조명
    {
        device: "light", header: "02311E91", length: 30, request: "ack",
        parseToProperty: (buf) => {
            let props = [];
            for (let i = 0; i < ((buf[5] & 0x0F) === 1 ? 4 : 2); i++) {
                props.push({ device: "light", room: buf[5] & 0x0F, name: `power${i + 1}`, value: (buf[6] & (1 << i)) ? "on" : "off" });
            }
            props.push({ device: "light", room: buf[5] & 0x0F, name: "all", value: (buf[6] & 0x0F) ? "on" : "off" });
            return props;
        }
    },

    // 콘센트
    {
        device: "outlet", header: "02311E91", length: 30, request: "ack",
        parseToProperty: (buf) => {
            let props = [];
            for (let i = 0; i < ((buf[5] & 0x0F) === 1 ? 3 : 2); i++) {
                let i1 = 14 + 2 * i, cons = (buf[i1] << 4 | buf[i1 + 1]) / 10 || 0;

                props.push({ device: "outlet", room: buf[5] & 0x0F, name: `power${i + 1}`, value: (buf[7] & (1 << i)) ? "on" : "off" });
                props.push({ device: "outlet", room: buf[5] & 0x0F, name: `usage${i + 1}`, value: cons });
            }
            props.push({ device: "outlet", room: buf[5] & 0x0F, name: "all", value: (buf[7] & 0x0F) ? "on" : "off" });
            props.push({ device: "outlet", room: buf[5] & 0x0F, name: "standby", value: (buf[7] >> 4 & 1) ? "on" : "off" });
            return props;
        }
    },

    // 난방
    {
        device: "thermostat", header: "02281091", length: 16, request: "ack",
        parseToProperty: (buf) => {
            let props = [
                { device: "thermostat", room: buf[5] & 0x0F, name: "power", value: (buf[6] & 0x01) ? "heat" : "off" },
                { device: "thermostat", room: buf[5] & 0x0F, name: "target", value: (buf[7] & 0x3F) + ((buf[7] & 0x40) && 0.5) },
                { device: "thermostat", room: buf[5] & 0x0F, name: "current", value: ((buf[8] << 8) + buf[9]) / 10.0 },
            ];
            return props;
        }
    },

    // 환기
    {
        device: "fan", header: "026180", length: 10, request: "ack",
        parseToProperty: (buf) => {
            let props = [
                { device: "fan", room: "1", name: "power", value: (buf[5] ? "on" : "off") },
                { device: "fan", room: "1", name: "preset", value: buf[5] === 0x11 ? "nature" : VENTTEMPI[buf[6]] }
            ];
            return props;
        }
    },

    // 가스
    {
        device: "gas", header: "023180", length: 10, request: "ack",
        parseToProperty: (buf) => {
            let props = [
                { device: "gas", room: "1", name: "cutoff", value: (buf[5] ? "on" : "off") },
                { device: "gas", room: "1", name: "power", value: (buf[5] ? "열림" : "닫힘") }
            ];
            return props;
        }
    },

    // 도어락
    {
        device: "doorlock", header: "024180", length: 10, request: "ack",
        parseToProperty: (buf) => {
            let props = [
                { device: "doorlock", room: "1", name: "cutoff", value: (buf[5] === 0x51 ? "off" : "on") },
                { device: "doorlock", room: "1", name: "power", value: (buf[5] === 0x51 ? "닫힘" : "열림") }
            ];
            return props;
        }
    },

    // 에너지
    {
        device: "energy", header: "02D13082", length: 48, request: "ack",
        parseToProperty: (buf) => {
            let props = [], index = 13;
            const range = { "eletric": [8, 12], "heat": [], "hotwater": [], "gas": [32, 35], "water": [17, 19] },
                keys = ["electric", "heat", "hotwater", "gas", "water"];

            for (const key of keys) {
                let total = parseInt(buf.slice(range[key][0], range[key][1]).toString("hex"));
                let realt = parseInt(buf.slice(index, index + 2).toString("hex"));
                index += 8;

                props.push({ device: "energy", room: key, name: "total", value: key === "electric" ? (total / 100).toFixed(1) : (total / 10) });
                props.push({ device: "energy", room: key, name: "realt", value: realt });
            }
            return props;
        }
    },
];

class CustomParser extends Transform {
    constructor(name) {
        super(name);
        this.name = name;
        this.reset();
    }

    reset() {
        this.energyUnit = new Uint8Array([0x31, 0x41, 0x42, 0xD1]);
        this.controlUnit = new Uint8Array([0x28, 0x31, 0x61]);

        // 개선: 인스턴스 변수 초기화
        this.bufferQueue = [];
        this.lengthCount = 0;
        this.expectedLength = undefined;
        this.isExpectedLength = false;
        this.foundPrefix = false; // 추가: 프리픽스를 찾았는지 여부를 추적

        this.headerSequence = (this.name === "energy" ? this.energyUnit : this.controlUnit);
    }

    _transform(chunk, encoding, done) {
        const prefix = 0x02;

        for (let i = 0; i < chunk.length; i++) {
            if (chunk[i] === prefix) {
                if (this.foundPrefix) {
                    // 개선: 기존 프리픽스를 찾은 상태에서 새로운 프리픽스를 찾으면 버퍼를 푸시하고 초기화
                    this.pushBufferQueue();
                }
                this.foundPrefix = true;
                const headerIndex = this.headerSequence.indexOf(chunk[i + 1]);

                if (headerIndex >= 0) {
                    if (this.bufferQueue.length > 0) {
                        this.pushBufferQueue();
                    }

                    const expectedLength = this.getExpectedLength(chunk, i);

                    if (expectedLength >= (this.name === "energy" ? 7 : 6)) {
                        this.expectedLength = expectedLength;
                        this.isExpectedLength = false;
                    } else {
                        this.reset();
                        return done();
                    }

                    if (chunk.length - i >= this.expectedLength) {
                        this.push(chunk.slice(i, i + this.expectedLength));
                        i += this.expectedLength - 1;
                        this.lengthCount = 0;
                    } else {
                        this.bufferQueue.push(chunk.slice(i));
                        this.lengthCount += chunk.length - i;
                        break; // 추가: 처리할 데이터가 부족하므로 루프 종료
                    }
                }
            }
        }

        if (this.bufferQueue.length > 1) {
            this.pushBufferQueue();
        }

        done();
    }

    _flush(done) {
        if (this.bufferQueue.length > 0) {
            this.pushBufferQueue();
        }
        this.reset();
        done();
    }

    // 개선: 버퍼를 푸시하는 코드를 별도의 메서드로 분리하여 재사용
    pushBufferQueue() {
        this.push(Buffer.concat(this.bufferQueue));
        this.bufferQueue = [];
        this.foundPrefix = false;
    }

    getExpectedLength(chunk, i) {
        let expectedLength = 0;

        if (this.name === "energy") {
            expectedLength = chunk[i + 2];
        } else {
            expectedLength = chunk[i + 1] === 0x28 ? chunk[i + 2] : 10;
        }
        return expectedLength;
    }
}


class BestinRS485 {
    constructor() {
        this._receivedMsgs = [];
        this._mqttConnected = false;
        this._syncTime = new Date();
        this._lastReceive = new Date();
        this._commandQueue = new Array();
        this._serialCmdQueue = new Array();
        this._deviceStatusCache = {};
        this._deviceStatus = [];

        this._mqttClient = this.mqttClient();
        this._connEnergy = this.createConnection(options.energy, "energy");
        this._connControl = this.createConnection(options.control, "control");
        this.serverCreate(options.server_enable, options.server_type);
    }

    mqttClient() {
        const client = mqtt.connect({
            host: options.mqtt.broker,
            port: options.mqtt.port,
            username: options.mqtt.username,
            password: options.mqtt.password,
        });

        client.on("connect", () => {
            logger.info("MQTT connection successful!");
            this._mqttConnected = true;

            const topic = "bestin/+/+/+/command";

            logger.info(`subscribe  ${topic}`);
            client.subscribe(topic, { qos: 2 });

            this.initialDiscovery(options.mqtt.prefix);
            setTimeout(() => this.initialEvResgister(), 1000);
        });

        client.on("error", (err) => {
            logger.error(`MQTT connection error: ${err}`);
            this._mqttConnected = false;
        });

        client.on("reconnect", () => {
            logger.warn("MQTT connection lost. try to reconnect...");
        });
        logger.info("initializing mqtt...");

        client.on("message", this.mqttCommand.bind(this));
        return client;
    }

    mqttCommand(topic, message) {
        if (!this._mqttConnected) {
            logger.warn("MQTT is not ready yet");
            return;
        }
        let topics = topic.split("/");
        let value = message.toString();
        let json;
        if (topics[0] !== options.mqtt.prefix) {
            return;
        }

        if (options.server_enable) {
            json = JSON.parse(fs.readFileSync("./session.json"));
        }

        logger.info(`recv. message: ${topic} = ${value}`);

        if (topics[2] === "0" || topics[1] === "elevator") {
            this.serverCommand(topics, value, json);
        } else {
            const [device, room, name] = topics.slice(1, 4);
            this.setCommandProperty(device, room, name, value);
        }
    }

    updateMqttClient(device, room, name, value) {
        if (!this._mqttConnected) {
            return;
        }
        const prefix = options.mqtt.prefix;
        const topic = `${prefix}/${device}/${room}/${name}/state`;

        if (typeof value !== "number") {
            // 사용량이 계속 바뀌는 경우 로깅 제외(에너지, 난방 현재온도, 콘센트 사용량 등)
            logger.info(`publish to mqtt: ${topic} = ${value}`);
        }
        this._mqttClient.publish(topic, String(value), { qos: 2, retain: true });
    }

    initialMqttClient(payload) {
        // only the elevator updates the initial status

        const topic = `${payload["~"]}/state`;
        const state = payload["state"];

        logger.info(`initial state: ${topic} = ${state}`);
        this._mqttClient.publish(topic, state, { qos: 2, retain: true });
    }

    formatDiscovery(prefix, device, room, name) {
        if (options.smart_lighting && room === "0") device = "lightDimming";

        for (let i = 0; i < DISCOVERY_PAYLOAD[device].length; i++) {
            let payload = Object.assign({}, DISCOVERY_PAYLOAD[device][i]);

            if (["outlet", "gas", "doorlock", "elevator"].includes(device)) {
                if (device === "outlet") {
                    payload["_intg"] = name.includes("usage") ? "sensor" : "switch";
                    payload["icon"] = name.includes("usage") ? "mdi:lightning-bolt" : "mdi:power-socket-eu";
                } else {
                    payload["_intg"] = name.includes(device === "elevator" ? "call" : "cutoff") ? "switch" : "sensor";
                }
            }
            payload["~"] = payload["~"].replace("{prefix}", prefix).replace("{room}", room).replace("{index}", name);
            payload["name"] = payload["name"].replace("{prefix}", prefix).replace("{room}", room).replace("{index}", name);
            payload["name"] = payload["name"].replace(/power[1-4]|switch/g, "");

            if (device === "energy") {
                payload["unit_of_meas"] = room === "electric" ? (name === "realt" ? "W" : "kWh") : (name === "realt" ? "m³/h" : "m³");
            }
            this.mqttDiscovery(payload);
        }
    }

    initialDiscovery(prefix) {
        let payload = DISCOVERY_PAYLOAD["lightCutoff"][0];
        payload["~"] = payload["~"].replace("{prefix}", prefix);
        payload["name"] = payload["name"].replace("{prefix}", prefix);

        this.mqttDiscovery(payload);
    }
    initialEvResgister() {
        logger.info("registering elevator srv...");
        this.serverCommand("elevator", null, JSON.parse(fs.readFileSync("./session.json")));
    }

    mqttDiscovery(payload) {
        if (payload["state"]) {
            this.initialMqttClient(payload);
        }
        let integration = payload["_intg"];
        let payloadName = payload["name"];

        payload.uniq_id = payloadName;
        payload.device = DISCOVERY_DEVICE;

        const topic = `homeassistant/${integration}/bestin_wallpad/${payloadName}/config`;
        this._mqttClient.publish(topic, JSON.stringify(payload), { qos: 2, retain: true });
    }

    // 패킷 체크섬 검증
    verifyCheckSum(packet) {
        let checksum = 3;

        for (let i = 0; i < packet.length - 1; i++) {
            checksum ^= packet[i];
            checksum = (checksum + 1) & 0xFF;
        }
        if (checksum !== packet[packet.length - 1]) {
            logger.warn(`checksum error: ${packet.toString("hex")}, ${checksum.toString(16)}`);
            return false;
        }
        return true;
    }

    // 명령 패킷 마지막 바이트(crc) 생성
    generateCheckSum(packet) {
        let checksum = 3;

        for (let i = 0; i < packet.length - 1; i++) {
            checksum ^= packet[i];
            checksum = (checksum + 1) & 0xFF;
        }
        return checksum;
    }

    createConnection(options, name) {
        if (options.path === "" && options.address === "") {
            // serial 또는 socket의 path나 address 값이 없다면 해당 포트는 사용하지 않는걸로 간주 비활성화
            logger.warn(`${name} connection disabled!`);
            return;
        }
        logger.info(`initializing ${options.type} :: ${name}...`);

        if (options.type === "serial") {
            this._ser = new SerialPort({
                path: options.path,
                baudRate: 9600,
                dataBits: 8,
                parity: "none",
                stopBits: 1,
                autoOpen: false,
                encoding: "hex"
            });

            this._ser.pipe(new CustomParser(name)).on("data", this.handlePacket.bind(this));
            this._ser.on("open", () => {
                logger.info(`successfully opened ${name} port: ${options.path}`);
            });
            this._ser.on("close", () => {
                logger.warn(`closed ${name} port: ${options.path}`);
            });
            this._ser.open((err) => {
                logger.error(`failed to open ${name} port: ${err.message}`);
            });

        } else {
            this._soc = new net.Socket();
            this._soc.connect(options.port, options.address, () => {
                logger.info(`successfully connected to ${name}  [${options.address}:${options.port}]`);
            });
            this._soc.on("error", (err) => {
                logger.error(`${name} connection error(${err.message}) occurred process.exit`);
                setTimeout(() => process.exit(1), 0);
            });
            this._soc.pipe(new CustomParser(name)).on("data", this.handlePacket.bind(this));
        }

        return (this._ser, this._soc);
    }

    handlePacket(packet) {
        this._lastReceive = new Date();

        if (packet[0] === 0x02) {
            this._syncTime = this._lastReceive;
            this._timestamp = packet[4];
        }
        const isValid = this.verifyCheckSum(packet);
        if (!isValid) return;

        const receivedMsg = this.findOrCreateReceivedMsg(packet);
        receivedMsg.count++;
        receivedMsg.lastlastReceive = receivedMsg.lastReceive;
        receivedMsg.lastReceive = this._lastReceive;
        receivedMsg.timeslot = this._lastReceive - this._syncTime;

        const foundIdx = this.findCommandIndex(packet);
        if (foundIdx[0] > -1) {
            logger.info(`ack from ${this._serialCmdQueue[foundIdx[0]].device}: ${this._serialCmdQueue[foundIdx[0]].cmdHex.toString("hex")} (${foundIdx[1]})`);
            const { callback, device } = this._serialCmdQueue[foundIdx[0]];
            if (callback) callback(receivedMsg);
            this._serialCmdQueue.splice(foundIdx[0], 1);
        }

        for (const msgInfo of receivedMsg.validMsgInfos) {
            this.updateProperties(msgInfo, packet, foundIdx[0] > -1);
        }
    }

    findOrCreateReceivedMsg(packet) {
        const { _receivedMsgs } = this;
        const codeHex = Buffer.from(packet);

        const found = _receivedMsgs.find(({ codeHex: existingCodeHex }) => existingCodeHex.equals(codeHex));
        if (found) return found;

        const code = codeHex.toString("hex");
        const expectLength = packet[2] === packet.length ? 4 : 3;
        const actualLength = packet.length;
        const actualHeader = packet.subarray(0, expectLength).toString("hex").toUpeerCase();

        const validMsgInfos = MSG_INFO.filter(({ header, length }) => {
            if (header === actualHeader && length === actualLength) return actualHeader;
        });

        const isValid = this.verifyCheckSum(packet);
        const receivedMsg = {
            code,
            codeHex,
            count: 0,
            validMsgInfos,
            isValid, // checksum
        };
        _receivedMsgs.push(receivedMsg);
        return receivedMsg;
    }

    findCommandIndex(packet) {
        const { _serialCmdQueue } = this;
        let ackSlice = "";
        let foundIdx = -1;

        for (let i = 0; i < _serialCmdQueue.length; i++) {
            const { cmdHex } = _serialCmdQueue[i];
            const secondByte = cmdHex[1];
            const iOffset = (cmdHex.length === 10) ? 2 : 3;
            const ackHex = ((secondByte === 0x28 ? 0x9 : 0x8) << 4) | (cmdHex[iOffset] & 0x0F);
            const packetI = packet[iOffset];

            if (secondByte === packet[1] && ackHex === packetI) {
                ackSlice = packet.slice(0, iOffset + 1).toString("hex");
                foundIdx = i;
                break;
            }
        }

        return [foundIdx, ackSlice];
    }

    updateProperties(msgInfo, packet, isCommandResponse) {
        if (!msgInfo.parseToProperty) return;

        const propArray = msgInfo.parseToProperty(packet);
        for (const { device, room, name, value } of propArray) {
            this.updateProperty(device, room, name, value, isCommandResponse);
        }
    }

    addCommandToQueue(cmdHex, device, room, name, value, callback) {
        const serialCmd = {
            cmdHex,
            device,
            room,
            property: name,
            value: value,
            callback,
            sentTime: new Date(),
            retryCount: options.rs485.max_retry
        };

        this._serialCmdQueue.push(serialCmd);
        logger.info(`send to device: ${cmdHex.toString("hex")}`);

        const elapsed = serialCmd.sentTime - this._syncTime;
        const delay = (elapsed < 100) ? 100 - elapsed : 0;
        // 100ms 이후 실행 하도록 함

        setTimeout(() => this.processCommand(serialCmd), delay);
    }

    processCommand(serialCmd) {
        if (this._serialCmdQueue.length === 0) {
            return;
        }
        serialCmd = this._serialCmdQueue.shift();

        const writeHandle = {
            "light": this._connEnergy,
            "outlet": this._connEnergy,
            "fan": this._connControl,
            "gas": this._connControl,
            "thermostat": this._connControl,
            "doorlock": this._connControl,
        }[serialCmd.device];
        // 디바이스별 포트 설정

        if (!writeHandle) {
            logger.error(`invalid device: ${serialCmd.device}`);
            return;
        }

        try {
            writeHandle.write(serialCmd.cmdHex);
        } catch (error) {
            logger.error(`wallpad send error: ${error}`);
        }

        if (serialCmd.retryCount > 0) {
            serialCmd.retryCount--;
            this._serialCmdQueue.push(serialCmd);
            setTimeout(() => this.processCommand(serialCmd), 100);
        } else {
            logger.warn(`command(${serialCmd.device}) has exceeded the maximum retry limit of ${options.rs485.max_retry} times`);
            if (serialCmd.callback) {
                serialCmd.callback.call(this);
            }
        }
    }

    putStatusProperty(device, room, property) {
        var deviceStatus = {
            device: device,
            room: room,
            property: (property ? property : {})
        };
        this._deviceStatus.push(deviceStatus);
        return deviceStatus;
    }

    OnOffDevice(device, value) {
        const devices = {
            "gas": [0x02, 0x31, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x3D],
            "doorlock": [0x02, 0x41, 0x02, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x4E],
            "lightcutoff": [0x02, 0x31, 0x0B, 0x02, 0x31, 0x3F, 0x00, 0x00, 0x00, 0x00, 0x51],
        };

        const deviceData = devices[device];
        if (!deviceData) return null;

        if (Array.isArray(deviceData)) {
            return Buffer.from(deviceData);
        }

        if (value !== "on" && value !== "off") return null;
        return Buffer.from(deviceData[value]);
    }

    setCommandProperty(device, room, name, value, callback) {
        const ownProp = room === "all" ? device + name : device;
        const msgInfo = MSG_INFO.find(e => e.setPropertyToMsg && (ownProp === e.device || ONOFFDEV.hasOwnProperty(ownProp)));

        if (!msgInfo) {
            logger.warn(`   unknown device: ${device}`);
            return;
        }
        if (ONOFFDEV.hasOwnProperty(ownProp) && value !== ONOFFDEV[ownProp]) {
            logger.warn(`   unknown command: ${device}, ${value}`)
            return;
        }
        if (value == "") {
            logger.warn(`   no payload: ${device}`)
            return;
        }

        const headBuf = Buffer.from(msgInfo.header, "hex");
        const restBuf = Buffer.alloc(msgInfo.length - headBuf.length);
        const cmdHex = Buffer.concat([headBuf, restBuf]);
        msgInfo.setPropertyToMsg(cmdHex, room, name, value);
        cmdHex[msgInfo.length - 1] = this.generateCheckSum(cmdHex);

        const buffer = ONOFFDEV.hasOwnProperty(ownProp) ? this.OnOffDevice(ownProp, value) : cmdHex;
        this.addCommandToQueue(buffer, device, room, name, value, callback);
    }

    updateProperty(device, room, name, value, force) {
        const propertyKey = device + room + name;
        const isSamePropertyValue = !force && this._deviceStatusCache[propertyKey] === value;
        if (isSamePropertyValue) return;

        this._deviceStatusCache[propertyKey] = value;

        let deviceStatus = this._deviceStatus.find(o => o.device === device && o.room === room);
        if (!deviceStatus) {
            deviceStatus = this.putStatusProperty(device, room);
        }
        deviceStatus.property[name] = value;

        this.updateMqttClient(device, room, name, value);

        const discoveryTime = setImmediate(() => {
            if (!this.discoveryCheck && options.mqtt.discovery) {
                this.formatDiscovery(options.mqtt.prefix, device, room, name);
            } else {
                return true;
            }
        });

        setTimeout(() => {
            clearImmediate(discoveryTime);
            this.discoveryCheck = true;
        }, 20000);
    }



    ////////////////////////////////////////////////////////
    ////////////////////////////////
    // HDC Server

    serverCreate(enable, type) {
        if (!enable) {
            return false;
        }

        const loginFunc = type === "v1" ? this.serverLogin.bind(this) : this.serverLogin2.bind(this);
        const url = type === "v1" ? this.format(V1LOGIN, options.server.address, options.server.username, options.server.password) : this.format(V2LOGIN, options.server.uuid);
        loginFunc("login", url);
        setInterval(loginFunc, type === "v1" ? 1200000 : 3600000, "refresh", url);
    }

    async serverLogin(time, url) {
        logger.info(`server login ===> ${JSON.stringify(url)}`);

        try {
            const response = await axios(url);

            if (time === "refresh") logger.info("IPARK v1 server session refreshing...");

            logger.info(`server login <=== ${JSON.stringify(response.data)}`);

            if (response.data.ret !== "success") {
                logger.info(`IPARK v1 server session ${time} fail. [${response.data.ret}]`);
            } else if (response.status === 401) {
                logger.info("session has expired. attempt to reconnect...");
                this.serverCreate(true, "v1");
            } else {
                logger.info(`IPARK v1 server session ${time} successful!`);

                this.loginManagement(response, "v1", time);
            }
        } catch (error) {
            if (error instanceof ReferenceError) return;

            logger.error(`IPARK v1 server login fail. return with: ${error}`);
        }
    }

    async serverLogin2(time, url) {
        logger.info(`server2 login ===> ${JSON.stringify(url)}`);

        try {
            const response = await axios(url);

            if (time === "refresh") logger.info("IPARK v2 server session refreshing...");

            logger.info(`server2 login <=== ${JSON.stringify(response.data)}`);

            if (response.status === 500) {
                logger.info(`IPARK v2 server session ${time} fail!`);
            } else {
                logger.info(`IPARK v2 server session ${time} successful!`);

                this.loginManagement(response.data, "v2", time);
            }
        } catch (error) {
            if (error instanceof ReferenceError) return;

            logger.error(`IPARK v2 server login fail. return with: ${error}`);
        }
    }

    format(obj, ...args) {
        Object.keys(obj).forEach(key => {
            const val = obj[key];
            if (typeof val === "object") {
                this.format(val, ...args);
            } else if (typeof val === "string") {
                obj[key] = val.replace(/\{(\d+)\}/g, (match, p1) => args[p1]);
            }
        });
        return obj;
    }

    jsonObject(obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    loginManagement(res, type, time) {
        const isV1 = type === "v1";
        const cookie = () => {
            const cookies = res.headers["set-cookie"];
            const cookieMap = cookies.reduce((acc, cookie) => {
                const [key, value] = cookie.split("=");
                acc[key] = value.split(";")[0];
                return acc;
            }, {});

            const cookieJson = {
                phpsessid: cookieMap["PHPSESSID"],
                userid: cookieMap["user_id"],
                username: cookieMap["user_name"],
            };

            if (!cookieJson) {
                logger.error("unable to assign parsed login cookie information to cookieInfo from server");
                return;
            }
            return cookieJson;
        }

        if (isV1) var cookieJson = cookie();
        const data = isV1 ? cookieJson : res;

        try {
            fs.writeFileSync("./session.json", JSON.stringify(data));
            if (time === "login") logger.info(`session.json file write successful!`);
        } catch (error) {
            logger.error(`session.json file write fail. [${error}]`);
        }
        const json = JSON.parse(fs.readFileSync("./session.json"));

        const statusUrl = isV1 ? this.format(this.jsonObject(V1LIGHTSTATUS), options.server.address, json.phpsessid, json.userid, json.username) : this.format(this.jsonObject(V2LIGHTSTATUS), json.url, options.smart_lighting ? "smartlight" : "livinglight", json["access-token"]);
        this.getServerLightStatus(statusUrl, type, "fresh");
        setInterval(() => {
            this.getServerLightStatus(statusUrl, type, "refresh");
        }, options.server.scan_interval * 1000);
    }

    async getServerLightStatus(url, type, time) {
        logger.info(`server lighting status ===> ${JSON.stringify(url)}`);

        try {
            const response = await axios(url);

            logger.info(`server lighting status <=== ${type === "v1" ? JSON.parse(JSON.stringify(response.data)) : JSON.stringify(response.data)
                }`);

            if (type === "v2" && response.data.result !== "ok") {
                logger.info("server light status request fail!");
                return;
            }
            logger.info("server light status request successful!");

            if (type === "v1") {
                this.parseXmlLightStatus(response.data);
            } else {
                this.parseJsonLightStatus(response.data);
            }
        } catch (error) {
            if (error instanceof ReferenceError) return;

            logger.error(`failed to retrieve server light status: ${error}`);
        }
    }

    parseXmlLightStatus(xml) {
        xml2js.parseString(xml, (err, result) => {
            if (err) {
                logger.error(`failed to parse XML light status: ${err}`);
                return;
            }

            const statusInfo = result?.imap?.service?.[0]?.status_info;

            if (!statusInfo) {
                logger.warn("failed to parse XML light status: status_info property not found");
                return;
            }

            statusInfo.forEach(status => {
                const device = "light";
                const room = "0";

                this.updateProperty(device, room, status.$.unit_num, status.$.unit_status);
            });
        });
    }

    mapColorValueInRange(value, inputMin, inputMax, outputMin, outputMax) {
        const ratio = (value - inputMin) / (inputMax - inputMin);
        const outputValue = outputMin + ratio * (outputMax - outputMin);
        return String(Math.round(outputValue));
    }

    parseJsonLightStatus(json) {
        let jsonData;

        try {
            jsonData = JSON.parse(JSON.stringify(json));
        } catch (error) {
            logger.error(`failed to parse JSON light status: ${error}`);
        }

        const units = options.smart_lighting ? jsonData?.map[0].units : jsonData?.units;
        if (!units) {
            logger.warn("failed to parse JSON light status: 'units' property not found");
            return;
        }

        let allOff = true;

        units.forEach((unit) => {
            const device = "light";
            const room = "0";

            if (unit.state === "on") {
                allOff = false;
            }
            if (true) {
                const unit = "all";
                const state = allOff ? "off" : "on";

                this.updateProperty(device, room, unit, state);
            }

            if (options.smart_lighting) {
                unit = { [`switch${unit.unit}`]: unit.state, "dimming": unit.dimming, "color": this.mapColorValueInRange(unit.color, 1, 10, 500, 153) };
                this.slightArray = units[0];
                for (let item in unit) {
                    this.updateProperty(device, room, item, unit[item]);
                }
            } else {
                this.updateProperty(device, room, unit.unit, unit.state);
            }
        });
    }

    async getServerEVStatus(json, response) {
        let eventData = {};
        const self = this;

        const es = new EventSource(`${json.url}/v2/admin/elevators/sse`);
        es.addEventListener("moveinfo", handleMoveInfo);

        es.onerror = (error) => {
            logger.error(`EventSource elevator error occurred: ${error}`);
            es.close();
        };

        function handleMoveInfo(event) {
            const data = JSON.parse(event.data);

            if (data.address === options.server.address) {
                eventData = {
                    device: "elevator",
                    serial: String(data.move_info.Serial),
                    data: {
                        call: response.result === "ok" ? "off" : "on",
                        direction: data.move_info.MoveDir || "대기",
                        floor: data.move_info.Floor || "대기 층"
                    }
                };
            }
            if (data?.move_info === undefined || data?.move_info === null) {
                cleaerEventListener();
            }

            for (const ed in eventData.data) {
                self.updateProperty(eventData.device, eventData.serial, ed, eventData.data[ed]);
            }
        }

        function cleaerEventListener() {
            es.removeEventListener("moveinfo", handleMoveInfo);
            es.close();
            logger.warn("elevator has arrived at its destination. terminate the server-sent events connection");
        }
    }

    serverCommand(topic, value, json) {
        if (topic[1] === "light") {
            this.serverLightCommand(topic[3], value, options.server_type, json);
        } else if (topic === "elevator" || topic[1] === "elevator") {
            const evUrl = this.format(V2ELEVATORCMD, json.url, options.server.address, options.server.uuid);
            const logMessage = 'elevator calls through the server are supported only in v2 version!';
            options.server_type === "v2" ? this.serverEvCommand(evUrl, json) : logger.warn(logMessage);
        }
    }

    serverlightCommandManager(unit, state, type, json) {
        let slightArray, url = {};

        if (type === "v1") {
            if (unit === "all") {
                logger.error('v1 server does not support living room lighting batch');
                return;
            }
            url = this.format(this.jsonObject(V1LIGHTCMD), options.server.address, json.phpsessid, json.userid, json.username, unit, state);
        } else {
            if (options.smart_lighting) {
                slightArray = this.slightArray;

                if (unit === "switch1") {
                    slightArray["state"] = state;
                } else {
                    if (unit === "dimming" && state === "0") slightArray["state"] = "off", slightArray["dimming"] = "0";
                    else if (unit === "dimming") slightArray["state"] = "on", slightArray["dimming"] = state;
                    else if (unit === "color") slightArray["state"] = "on", slightArray["color"] = this.mapColorValueInRange(state, 500, 153, 1, 10);
                }
                url = this.format(this.jsonObject(V2SLIGHTCMD), json.url, JSON.stringify(slightArray), json["access-token"]);
            } else {
                url = this.format(this.jsonObject(V2LIGHTCMD), json.url, unit.slice(-1), unit, state, json["access-token"]);
            }
        }
        return url;
    }

    async serverLightCommand(unit, state, type, json) {
        const url = this.serverlightCommandManager(unit, state, type, json);

        logger.info(`server lighting command ===> ${JSON.stringify(url)}`);

        try {
            const response = await axios(url);

            logger.info(`server lighting command <=== ${type === "v1" ? JSON.parse(JSON.stringify(response.data)) : JSON.stringify(response.data)
                }`);

            if (type === "v2" && response.data.result !== "ok") {
                logger.info("server livinglight command request fail!");
                return;
            }
            logger.info("server livinglight command request successful!");

            const device = "light";
            const room = "0";
            let allOff = true;

            if (state === "on") {
                allOff = false;
            }

            if (true) {
                const unit = "all";
                const state = allOff ? "off" : "on";

                this.updateProperty(device, room, unit, state);
            }

            this.updateProperty(device, room, unit, state);
        } catch (error) {
            if (error instanceof ReferenceError) return;

            logger.error(`failed to retrieve server light command: ${error}`);
        }
    }

    async serverEvCommand(url, json) {
        logger.info(`server ev command ===> ${JSON.stringify(url)}`);

        try {
            const response = await axios(url);

            logger.info(`server ev command  <=== ${JSON.stringify(response.data)}`);
            if (response.data.result === "ok") {
                logger.info("server elevator command request successful!");
                this.getServerEVStatus(json, response.data);
            } else {
                logger.info("server elevator command request fail!");
            }
        } catch (error) {
            if (error instanceof ReferenceError) return;

            logger.error(`failed to retrieve server ev command: ${error}`);
        }
    }

};


new BestinRS485();
