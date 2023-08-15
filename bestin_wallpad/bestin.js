/*
 * @description bestin.js
 * @author harwin1
 */

const logger = require('./srv/logger.js');
const options = require('/data/options.json');

const { SerialPort } = require('serialport');

const mqtt = require('mqtt');
const net = require('net');
const fs = require('fs');

////////////////////////////////
const axios = require('axios');
const EventSource = require('eventsource');
const xml2js = require('xml2js');

const {
    VENTTEMP,
    VENTTEMPI,
    ONOFFDEV,
    HEMSELEM,
    HEMSMAP,
    DISCOVERY_DEVICE,
    DISCOVERY_PAYLOAD,

    V1LOGIN,
    V2LOGIN,
    V1LIGHTSTATUS,
    V2LIGHTSTATUS,
    V1LIGHTCMD,
    V2LIGHTCMD,
    V2SLIGHTCMD,
    V2ELEVATORCMD,
    format,
    deepCopyObject,
    recursiveFormatWithArgs
} = require('./srv/const.js');

const MSG_INFO = [
    //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////// COMMAND

    // 조명
    {
        device: 'light', header: '02310D01', length: 13, request: 'set',
        setPropertyToMsg: (b, i, n, v) => {
            let id = n.slice(-1) - 1, pos = (v === "on" ? 0x80 : 0x00), onff = (v === "on" ? 0x04 : 0x00);

            b[5] = i & 0x0F;
            b[6] = (0x01 << id | pos);
            b[11] = onff;
            return b;
        }
    },

    // 콘센트
    {
        device: 'outlet', header: '02310D01', length: 13, request: 'set',
        setPropertyToMsg: (b, i, n, v) => {
            let id = n.slice(-1) - 1, pos = (v === "on" ? 0x80 : 0x00), onff = (v === "on" ? 0x09 << id : 0x00);

            b[5] = i & 0x0F;
            if (n === "standby") b[8] = (v === "on" ? 0x83 : 0x03);
            else b[7] = (0x01 << id | pos), b[11] = onff;
            return b;
        }
    },

    // 난방
    {
        device: 'thermostat', header: '02280E12', length: 14, request: 'set',
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
        device: 'fan', header: '026100', length: 10, request: 'set',
        setPropertyToMsg: (b, i, n, v) => {
            if (n === "power") b[2] = 0x01, b[5] = (v === "on" ? 0x01 : 0x00), b[6] = 0x01;
            else b[2] = (v === "nature" ? 0x07 : 0x03), b[6] = VENTTEMP[v];
            return b;
        }
    },

    //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////// STATE

    // 조명
    {
        device: 'light', header: '02311E91', length: 30, request: 'ack',
        parseToProperty: (buf) => {
            let props = [];
            for (let i = 0; i < ((buf[5] & 0x0F) === 1 ? 4 : 2); i++) {
                props.push({ device: 'light', room: buf[5] & 0x0F, name: `power${i + 1}`, value: (buf[6] & (1 << i)) ? "on" : "off" });
            }
            return props;
        }
    },

    // 콘센트
    {
        device: 'outlet', header: '02311E91', length: 30, request: 'ack',
        parseToProperty: (buf) => {
            let props = [];
            for (let i = 0; i < ((buf[5] & 0x0F) === 1 ? 3 : 2); i++) {
                let i1 = 14 + 2 * i, current = (buf[i1] << 4 | buf[i1 + 1]) / 10 || 0;

                props.push({ device: 'outlet', room: buf[5] & 0x0F, name: `power${i + 1}`, value: (buf[7] & (1 << i)) ? "on" : "off" });
                props.push({ device: 'outlet', room: buf[5] & 0x0F, name: `usage${i + 1}`, value: current });
            }
            props.push({ device: 'outlet', room: buf[5] & 0x0F, name: 'standby', value: (buf[7] >> 4 & 1) ? "on" : "off" });
            return props;
        }
    },

    // 난방
    {
        device: 'thermostat', header: '02281091', length: 16, request: 'ack',
        parseToProperty: (buf) => {
            let props = [
                { device: 'thermostat', room: buf[5] & 0x0F, name: 'power', value: (buf[6] & 0x01) ? "heat" : "off" },
                { device: 'thermostat', room: buf[5] & 0x0F, name: 'target', value: (buf[7] & 0x3F) + ((buf[7] & 0x40) && 0.5) },
                { device: 'thermostat', room: buf[5] & 0x0F, name: 'current', value: ((buf[8] << 8) + buf[9]) / 10.0 },
            ];
            return props;
        }
    },

    // 환기
    {
        device: 'fan', header: '026180', length: 10, request: 'ack',
        parseToProperty: (buf) => {
            let props = [
                { device: 'fan', room: '1', name: 'power', value: (buf[5] ? "on" : "off") },
                { device: 'fan', room: '1', name: 'preset', value: buf[5] === 0x11 ? "nature" : VENTTEMPI[buf[6]] }
            ];
            return props;
        }
    },

    // 가스
    {
        device: 'gas', header: '023180', length: 10, request: 'ack',
        parseToProperty: (buf) => {
            let props = [
                { device: 'gas', room: '1', name: 'cutoff', value: (buf[5] ? "on" : "off") },
                { device: 'gas', room: '1', name: 'power', value: (buf[5] ? "열림" : "닫힘") }
            ];
            return props;
        }
    },

    // 도어락
    {
        device: 'doorlock', header: '024180', length: 10, request: 'ack',
        parseToProperty: (buf) => {
            let props = [
                { device: 'doorlock', room: '1', name: 'cutoff', value: (buf[5] === 0x51 ? "off" : "on") },
                { device: 'doorlock', room: '1', name: 'power', value: (buf[5] === 0x51 ? "닫힘" : "열림") }
            ];
            return props;
        }
    },

    // 에너지
    {
        device: 'energy', header: '02D13082', length: 48, request: 'ack',
        parseToProperty: (buf) => {
            let props = [], i = 13;

            for (const h of HEMSELEM) {
                let total = parseInt(buf.slice(HEMSMAP[h][0], HEMSMAP[h][1]).toString('hex'));
                let realt = parseInt(buf.slice(i, i + 2).toString('hex'));
                i += 8;

                props.push({ device: 'energy', room: h, name: 'total', value: h === "electric" ? (total / 100).toFixed(1) : (total / 10) });
                props.push({ device: 'energy', room: h, name: 'realt', value: realt });
            }
            return props;
        }
    },
];


class BestinRS485 {
    constructor() {
        this.receivedMessages = [];
        this.isMqttConnected = false;
        this.synchronizedTime = new Date();
        this.lastReceivedTimestamp = new Date();
        this.commandQueue = new Array();
        this.serialCommandQueue = new Array();
        this.deviceStatusCache = {};
        this.deviceStatusArray = [];

        this.mqttClient = this.createMqttClient();
        this.mqttPrefix = options.mqtt.prefix;
        this.energyConnection = this.createConnection(options.energy, 'energy');
        this.controlConnection = this.createConnection(options.control, 'control');

        if (options.server_enable) {
            // HDC server instance creates
            this.serverCreate(options.server_type);
            this.shouldRegisterSrvEV = options.server_enable && options.server_type === "v2";
            this.hasSmartLighting = options.smart_lighting;
            this.smartLightingType = options.smart_lighting ? "smartlight" : "livinglight";
        }
    }

    createMqttClient() {
        const client = mqtt.connect({
            host: options.mqtt.broker,
            port: options.mqtt.port,
            username: options.mqtt.username,
            password: options.mqtt.password,
        });

        client.on('connect', () => {
            logger.info("MQTT connection successful!");
            this.isMqttConnected = true;

            const topic = `${this.mqttPrefix}/+/+/+/command`;
            client.subscribe(topic);

            if (this.shouldRegisterSrvEV) {
                logger.info("registering elevator srv...");
                this.serverCommand('elevator', null, JSON.parse(fs.readFileSync('./session.json')));
            }
        });

        client.on('error', (err) => {
            logger.error(`MQTT connection error: ${err}`);
            this.isMqttConnected = false;
        });

        client.on('reconnect', () => {
            logger.warn("MQTT connection lost. try to reconnect...");
        });
        logger.info("initializing mqtt...");

        client.on('message', this.mqttCommand.bind(this));
        return client;
    }

    mqttCommand(topic, message) {
        if (!this.isMqttConnected) {
            logger.warn("MQTT is not ready yet");
            return;
        }
        let topics = topic.split('/');
        let value = message.toString();
        let json;
        if (topics[0] !== options.mqtt.prefix) {
            return;
        }
        logger.info(`recv. message: ${topic} = ${value}`);

        if (options.server_enable) {
            json = JSON.parse(fs.readFileSync('./session.json'));
        } else {
            logger.info('The server is not active!');
            return;
        }

        if (topics[2] === "0" || topics[1] === "elevator") {
            this.serverCommand(topics, value, json);
        } else {
            const [device, room, name] = topics.slice(1, 4);
            this.setCommandProperty(device, room, name, value);
        }
    }

    updateMqttClient(device, room, name, value) {
        if (!this.isMqttConnected) {
            return;
        }
        const topic = `${this.mqttPrefix}/${device}/${room}/${name}/state`;

        if (typeof value !== "number") {
            logger.info(`publish to MQTT: ${topic} = ${value}`);
        }
        this.mqttClient.publish(topic, value.toString());
    }

    formatDiscovery(device, room, name) {
        if (this.hasSmartLighting && room === "0") device = "lightDimming";

        for (let i = 0; i < DISCOVERY_PAYLOAD[device].length; i++) {
            let payload = Object.assign({}, DISCOVERY_PAYLOAD[device][i]);

            if (['outlet', 'gas', 'doorlock', 'elevator'].includes(device)) {
                if (device === "outlet") {
                    payload['_intg'] = name.includes('usage') ? "sensor" : "switch";
                    payload['icon'] = name.includes('usage') ? "mdi:lightning-bolt" : "mdi:power-socket-eu";
                } else {
                    payload['_intg'] = name.includes(device === "elevator" ? "call" : "cutoff") ? "switch" : "sensor";
                }
            }
            payload['~'] = format(payload['~'], this.mqttPrefix, room, name);
            payload['name'] = format(payload['name'], this.mqttPrefix, room, name);
            if (!['gas', 'doorlock'].includes(device)) {
                payload['name'] = payload['name'].replace(/power|switch/g, '');
            }

            if (device === 'energy') {
                payload['unit_of_meas'] = room === "electric" ? (name === "realt" ? "W" : "kWh") : (name === "realt" ? "m³/h" : "m³");
            }
            this.mqttDiscovery(payload);
        }
    }

    mqttDiscovery(payload) {
        let integration = payload['_intg'];
        let payloadName = payload['name'];

        payload.uniq_id = payloadName;
        payload.device = DISCOVERY_DEVICE;

        const topic = `homeassistant/${integration}/bestin_wallpad/${payloadName}/config`;
        this.mqttClient.publish(topic, JSON.stringify(payload));
    }

    verifyCheckSum(packet) {
        let checksum = 3;

        for (let i = 0; i < packet.length - 1; i++) {
            checksum ^= packet[i];
            checksum = (checksum + 1) & 0xFF;
        }
        if (checksum !== packet[packet.length - 1]) {
            logger.warn(`checksum error: ${packet.toString('hex')}, ${checksum.toString(16)}`);
            return false;
        }
        return true;
    }

    generateCheckSum(packet) {
        let checksum = 3;

        for (let i = 0; i < packet.length - 1; i++) {
            checksum ^= packet[i];
            checksum = (checksum + 1) & 0xFF;
        }
        return checksum;
    }

    createConnection(connData, serialName) {
        if (connData.path === "" && connData.address === "") {
            logger.warn(`${serialName} connection disabled!`);
            return;
        }
        logger.info(`initializing ${connData.type}::${serialName}...`);

        if (connData.type === "serial") {
            this.serial = new SerialPort({
                path: connData.path,
                baudRate: 9600,
                dataBits: 8,
                parity: 'none',
                stopBits: 1,
                autoOpen: false,
                encoding: 'hex'
            });

            this.serial.on('data', (data) => {
                const parserSelect = serialName.charAt(0).toUpperCase() + serialName.slice(1);
                this[`handle${parserSelect}Parser`](data);
            });
            this.serial.on('open', () => {
                logger.info(`successfully opened ${serialName} port: ${connData.path}`);
            });
            this.serial.on('close', () => {
                logger.warn(`closed ${serialName} port: ${connData.path}`);
            });
            this.serial.open((err) => {
                logger.error(`failed to open ${serialName} port: ${err.message}`);
            });

        } else {
            this.socket = net.connect({ host: connData.address, port: connData.port });
            this.socket.on('connect', () => {
                logger.info(`successfully connected to ${serialName} server`);
            });

            this.socket.on('data', (data) => {
                const parserSelect = serialName.charAt(0).toUpperCase() + serialName.slice(1);
                this[`handle${parserSelect}Parser`](data);
            });
            this.socket.on('end', () => {
                logger.info(`disconnected from ${serialName} server`);
            });
            this.socket.on('error', (err) => {
                logger.error(`${serialName} connection error (${err.message}) occurred`);
            });
            this.socket.on('timeout', () => {
                this.log.error(`${serialName} connection timed out`);
            });
        }

        return (this.serial, this.socket);
    }

    handleEnergyParser(data) {
        const separator = Buffer.from([0x02]);

        const findPacketStartIndexes = (data, separator) => {
            const indexes = [];
            let currentIndex = 0;

            while (currentIndex < data.length) {
                const index = data.indexOf(separator, currentIndex);
                if (index === -1) break;
                indexes.push(index);
                currentIndex = index + 1;
            }
            return indexes;
        }

        const extractPackets = (data, indexes, conditionBytes) => {
            const packets = [];

            for (const index of indexes) {
                const conditionIndex = index + 1;
                if (
                    conditionIndex + conditionBytes.length <= data.length &&
                    conditionBytes.some(byte => byte === data[conditionIndex])
                ) {
                    const lengthBytes = data.slice(index, conditionIndex + 2).slice(-1);
                    const packetLength = parseInt(lengthBytes.toString('hex'), 16);
                    const packetData = data.slice(index, index + packetLength);
                    packets.push(packetData);
                }
            }
            return packets;
        }

        const conditionBytes = [0x31, 0x41, 0x42, 0xD1];
        const packetStartIndexes = findPacketStartIndexes(data, separator);
        const extractedPackets = extractPackets(data, packetStartIndexes, conditionBytes);

        for (const packet of extractedPackets) {
            this.handlePacket(packet);
        }
    }

    handleControlParser(data) {
        const separator = Buffer.from([0x02]);

        const findPacketStartIndexes = (data, separator) => {
            const indexes = [];
            let currentIndex = 0;

            while (currentIndex < data.length) {
                const index = data.indexOf(separator, currentIndex);
                if (index === -1) break;
                indexes.push(index);
                currentIndex = index + 1;
            }
            return indexes;
        };

        const packetLength = (data, index, length = 0) => {
            if (data[index + 1] === 0x60 || ['3100', '3180'].includes(data.slice(index + 1, index + 3).toString('hex'))) {
                length = 10;
            } else {
                length = parseInt(data.slice(index + 2, index + 3).toString('hex'), 16);
            }
            return length;
        };

        const extractPackets = (data, indexes, conditionBytes) => {
            const packets = [];

            for (const index of indexes) {
                const conditionIndex = index + 1;
                if (
                    conditionIndex + conditionBytes.length <= data.length &&
                    conditionBytes.some(byte => byte === data[conditionIndex])
                ) {
                    const packetData = data.slice(index, index + packetLength(data, index));
                    packets.push(packetData);
                }
            }
            return packets;
        }

        const conditionBytes = [0x28, 0x31, 0x41, 0x61, 0xD1, 0xB1];
        const packetStartIndexes = findPacketStartIndexes(data, separator);
        const extractedPackets = extractPackets(data, packetStartIndexes, conditionBytes);

        for (const packet of extractedPackets) {
            if (packet.length <= 2) {
                return; /** broken Packets */
            }
            this.handlePacket(packet);
        }
    }


    handlePacket(packet) {
        //console.log('recive packet:', packet.toString('hex'))
        this.lastReceivedTimestamp = new Date();

        if (packet[0] === 0x02) {
            this.synchronizedTime = this.lastReceivedTimestamp;
            this._timestamp = packet[4];
        }
        const isValid = this.verifyCheckSum(packet);
        if (!isValid) return;

        const receivedMsg = this.findOrCreateReceivedMsg(packet);
        receivedMsg.count++;
        receivedMsg.lastlastReceive = receivedMsg.lastReceive;
        receivedMsg.lastReceive = this.lastReceivedTimestamp;
        receivedMsg.timeslot = this.lastReceivedTimestamp - this.synchronizedTime;

        const { foundIdx, ackPacket } = this.findCommandIndex(packet);
        if (foundIdx > -1) {
            logger.info(`ack from device: ${ackPacket}`);
            if (this.serialCommandQueue[foundIdx].callback) callback(receivedMsg);
            this.serialCommandQueue.splice(foundIdx, 1);
        }

        for (const msgInfo of receivedMsg.validMsgInfos) {
            this.updateProperties(msgInfo, packet, foundIdx[0] > -1);
        }
    }

    findOrCreateReceivedMsg(packet) {
        const { receivedMessages } = this;
        const codeHex = Buffer.from(packet);

        const found = receivedMessages.find(({ codeHex: existingCodeHex }) => existingCodeHex.equals(codeHex));
        if (found) return found;

        const code = codeHex.toString('hex');
        const expectLength = packet[2] === packet.length ? 4 : 3;
        const actualLength = packet.length;
        const actualHeader = packet.subarray(0, expectLength).toString('hex').toUpperCase();

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
        receivedMessages.push(receivedMsg);
        return receivedMsg;
    }

    findCommandIndex(packet) {
        const { serialCommandQueue } = this;
        let ackPacket = "";
        let foundIdx = -1;

        for (let i = 0; i < serialCommandQueue.length; i++) {
            const { cmdHex } = serialCommandQueue[i];
            const secondByte = cmdHex[1];
            const iOffset = (cmdHex.length === 10) ? 2 : 3;
            const ackHex = ((secondByte === 0x28 ? 0x9 : 0x8) << 4) | (cmdHex[iOffset] & 0x0F);
            const packetI = packet[iOffset];

            if (secondByte === packet[1] && ackHex === packetI) {
                ackPacket = packet.toString('hex');
                foundIdx = i;
                break;
            }
        }
        return { foundIdx, ackPacket };
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

        this.serialCommandQueue.push(serialCmd);
        logger.info(`send to device: ${cmdHex.toString('hex')}`);

        const elapsed = serialCmd.sentTime - this.synchronizedTime;
        const delay = (elapsed < 100) ? 100 - elapsed : 0;
        // 100ms after

        setTimeout(() => this.processCommand(serialCmd), delay);
    }

    processCommand(serialCmd) {
        if (this.serialCommandQueue.length === 0) {
            return;
        }
        serialCmd = this.serialCommandQueue.shift();

        const writeHandle = {
            light: this.energyConnection,
            outlet: this.energyConnection,
            fan: this.controlConnection,
            gas: this.controlConnection,
            thermostat: this.controlConnection,
            doorlock: this.controlConnection,
        }[serialCmd.device];
        // device port mapping

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
            this.serialCommandQueue.push(serialCmd);
            setTimeout(() => this.processCommand(serialCmd), 100);
        } else {
            logger.error(`command(${serialCmd.device}}) max retry number exceeded!`);
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
        this.deviceStatusArray.push(deviceStatus);
        return deviceStatus;
    }

    OnOffDevice(device, value) {
        const devices = {
            gas: [0x02, 0x31, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x3D],
            doorlock: [0x02, 0x41, 0x02, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x4E],
            // : [0x02, 0x31, 0x0B, 0x02, 0x31, 0x3F, 0x00, 0x00, 0x00, 0x00, 0x51],
        };

        const deviceData = devices[device];
        if (!deviceData) return null;

        if (Array.isArray(deviceData)) {
            return Buffer.from(deviceData);
        }

        if (value !== 'on' && value !== 'off') return null;
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

        const headBuf = Buffer.from(msgInfo.header, 'hex');
        const restBuf = Buffer.alloc(msgInfo.length - headBuf.length);
        const cmdHex = Buffer.concat([headBuf, restBuf]);
        msgInfo.setPropertyToMsg(cmdHex, room, name, value);
        cmdHex[msgInfo.length - 1] = this.generateCheckSum(cmdHex);

        const buffer = ONOFFDEV.hasOwnProperty(ownProp) ? this.OnOffDevice(ownProp, value) : cmdHex;
        this.addCommandToQueue(buffer, device, room, name, value, callback);
    }

    updateProperty(device, room, name, value, force) {
        const propertyKey = device + room + name;
        const isSamePropertyValue = !force && this.deviceStatusCache[propertyKey] === value;
        if (isSamePropertyValue) return;

        this.deviceStatusCache[propertyKey] = value;

        let deviceStatus = this.deviceStatusArray.find(o => o.device === device && o.room === room);
        if (!deviceStatus) {
            deviceStatus = this.putStatusProperty(device, room);
        }
        deviceStatus.property[name] = value;

        this.updateMqttClient(device, room, name, value);

        const discoveryTime = setImmediate(() => {
            if (!this.discoveryCheck && options.mqtt.discovery) {
                this.formatDiscovery(device, room, name);
            } else {
                return true;
            }
        });

        setTimeout(() => {
            clearImmediate(discoveryTime);
            this.discoveryCheck = true;
        }, 20000);
    }

    ////////////////////////////////////////////////////////////////////////////////////////
    // HDC Server

    async serverCreate(type) {
        const loginFormat = type === "v1"
            ? await recursiveFormatWithArgs(V1LOGIN, options.server.address, options.server.username, options.server.password)
            : await recursiveFormatWithArgs(V2LOGIN, options.server.uuid);

        this[`${type}LoginFormat`] = loginFormat;
        const loginFunc = type === "v1" ? this.serverLogin.bind(this) : this.serverLogin2.bind(this);

        await loginFunc('login', loginFormat);
        setInterval(loginFunc, 3600000, 'refresh', loginFormat);
    }

    async serverLogin(time, url) {
        logger.debug(`server login ===> ${JSON.stringify(url)}`);

        try {
            const response = await axios(url);

            if (time === "refresh") logger.info("server session refreshing...");

            if (response.data.ret !== "success") {
                logger.info(`server session ${time} fail. [${response.data.ret}]`);
            } else {
                logger.debug(`server login <=== ${JSON.stringify(response.data)}`);
                logger.info(`server session ${time} successful!`);

                this.loginManagement(response, 'v1', time);
            }
        } catch (error) {
            if (error instanceof ReferenceError) return;

            logger.error(`server login fail. return with: ${error}`);
        }
    }

    async serverLogin2(time, url) {
        logger.debug(`server2 login ===> ${JSON.stringify(url)}`);

        try {
            const response = await axios(url);

            if (time === "refresh") logger.info("server2 session refreshing...");

            if (response.status === 500) {
                logger.info(`server2 session ${time} fail!`);
            } else {
                logger.debug(`server2 login <=== ${JSON.stringify(response.data)}`);
                logger.info(`server2 session ${time} successful!`);

                this.loginManagement(response.data, 'v2', time);
            }
        } catch (error) {
            if (error instanceof ReferenceError) return;

            logger.error(`server2 login fail. return with: ${error}`);
        }
    }

    async loginManagement(res, type, time) {
        const isV1 = type === "v1";

        const cookie = () => {
            const cookies = res.headers['set-cookie'];
            const cookieMap = cookies.reduce((acc, cookie) => {
                const [key, value] = cookie.split('=');
                acc[key] = value.split(';')[0];
                return acc;
            }, {});

            const cookieJson = {
                phpsessid: cookieMap['PHPSESSID'],
                userid: cookieMap['user_id'],
                username: cookieMap['user_name'],
            };

            if (!cookieJson) {
                logger.warn("unable to assign parsed login cookie information to cookieInfo from server");
                return;
            }

            return cookieJson;
        }

        const cookieJson = isV1 ? cookie() : undefined;
        const data = isV1 ? cookieJson : res;

        try {
            fs.writeFileSync('./session.json', JSON.stringify(data));
            if (time === "login") logger.info(`session.json file write successful!`);
        } catch (error) {
            logger.error(`session.json file write fail. [${error}]`);
        }

        const json = JSON.parse(fs.readFileSync('./session.json'));

        const statusUrl = isV1
            ? await recursiveFormatWithArgs(V1LIGHTSTATUS, options.server.address, json.phpsessid, json.userid, json.username)
            : await recursiveFormatWithArgs(V2LIGHTSTATUS, json.url, this.smartLightingType, json['access-token']);

        await this.getServerLightStatus(statusUrl, type, 'fresh');

        if (options.server.scan_interval !== 0) {
            setInterval(async () => { await this.getServerLightStatus(statusUrl, type, 'refresh'); }, options.server.scan_interval * 1000);
        }
    }

    async getServerLightStatus(url, type, time) {
        logger.debug(`server lighting status ===> ${JSON.stringify(url)}`);

        try {
            const response = await axios(url);
            const result = this.serverRequestResult(response.data);

            if (result === "ok") {
                logger.debug(`server lighting status <=== ${JSON.parse(JSON.stringify(response.data)) || JSON.stringify(response.data)}`);
                logger.info('server light status request successful!');

                type === "v1" ? this.parseXmlLightStatus(response.data) : this.parseJsonLightStatus(response.data);
            } else if (result !== "ok") {
                logger.warn(`failed to update lighting status. Result: ${result}`);
            } else {
                logger.warn("session has expired. attempt to reconnect...");
                setTimeout(async () => {
                    type === 'v1' ? await this.serverLogin('refresh', this.v1LoginFormat) : await this.serverLogin2('refresh', this.v2LoginFormat);
                }, 1000);
            }
        } catch (error) {
            if (error instanceof ReferenceError || error instanceof TypeError) return;

            logger.error(`failed to retrieve server light status: ${error}`);
        }
    }

    serverRequestResult(response) {
        xml2js.parseString(response, (err, result) => {
            if (err) {
                logger.error(`failed to parse XML server result status: ${err}`);
                return;
            }
            this.result = result.imap.service[0].$.result;
        });

        return !this.result ? response.data.result : this.result;
    }

    parseXmlLightStatus(xml) {
        xml2js.parseString(xml, (err, result) => {
            if (err) {
                logger.error(`failed to parse XML light status: ${err}`);
                return;
            }
            const statusInfo = result.imap.service[0].status_info;

            if (!statusInfo) {
                logger.warn("failed to parse XML light status: status_info property not found");
                return;
            }

            statusInfo.forEach(status => {
                const device = 'light';
                const room = '0';

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

        const units = options.smart_lighting ? jsonData.map[0].units : jsonData.units;
        if (!units) {
            logger.warn("failed to parse JSON light status: 'units' property not found");
            return;
        }
        this.smartLightDataArray = units[0];

        units.forEach((unit) => {
            const device = 'light';
            const room = '0';

            if (this.hasSmartLighting) {
                unit = { [`switch${unit.unit}`]: unit.state, 'dimming': unit.dimming, 'color': this.mapColorValueInRange(unit.color, 1, 10, 500, 153) };
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
        es.addEventListener('moveinfo', handleMoveInfo);

        es.onerror = (error) => {
            logger.error(`EventSource elevator error occurred: ${error}`);
            es.close();
        };

        function handleMoveInfo(event) {
            const data = JSON.parse(event.data);

            if (data.address === options.server.address) {
                eventData = {
                    device: 'elevator',
                    serial: String(data.move_info.Serial),
                    data: {
                        call: response.result === 'ok' ? 'off' : 'on',
                        direction: data.move_info.MoveDir || '대기',
                        floor: data.move_info.Floor || '대기 층'
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
            es.removeEventListener('moveinfo', handleMoveInfo);
            es.close();
            logger.warn('elevator has arrived at its destination. terminate the server-sent events connection');
        }
    }

    serverCommand(topic, value, json) {
        if (topic[1] === "light") {
            this.serverLightCommand(topic[3], value, options.server_type, json);
        } else if (topic === "elevator" || topic[1] === "elevator") {
            const evUrl = recursiveFormatWithArgs(V2ELEVATORCMD, json.url, options.server.address, options.server.uuid);
            const msg = "elevator calls through the server are supported only in v2 version!";
            this.shouldRegisterSrvEV ? this.serverEvCommand(evUrl, json) : logger.error(msg);
        }
    }

    serverlightCommandManager(unit, state, type, json) {
        let smartLightDataArray, url = {};

        if (type === 'v1') {
            url = recursiveFormatWithArgs(V1LIGHTCMD, options.server.address, json.phpsessid, json.userid, json.username, unit, state);
        } else {
            if (this.hasSmartLighting) {
                smartLightDataArray = this.smartLightDataArray;

                if (unit === 'switch1') {
                    slightArray['state'] = state;
                } else {
                    if (unit === 'dimming' && state === '0') slightArray['state'] = 'off', slightArray['dimming'] = '0';
                    else if (unit === 'dimming') slightArray['state'] = 'on', slightArray['dimming'] = state;
                    else if (unit === 'color') slightArray['state'] = 'on', slightArray['color'] = this.mapColorValueInRange(state, 500, 153, 1, 10);
                }
                url = recursiveFormatWithArgs(V2SLIGHTCMD, json.url, JSON.stringify(slightArray), json['access-token']);
            } else {
                url = recursiveFormatWithArgs(V2LIGHTCMD, json.url, unit.slice(-1), unit, state, json['access-token']);
            }
        }

        return deepCopyObject(url);
    }

    async serverLightCommand(unit, state, type, json) {
        const url = this.serverlightCommandManager(unit, state, type, json);

        logger.debug(`server lighting command ===> ${JSON.stringify(url)}`);

        try {
            const response = await axios(url);
            const result = this.serverRequestResult(response.data);

            if (result !== "ok") {
                logger.warn(`failed to server lighting command. Result: ${result}`);
                return;
            }
            logger.debug(`server lighting command <=== ${JSON.parse(JSON.stringify(response.data)) || JSON.stringify(response.data)}`);
            logger.info("server livinglight command request successful!");

            const device = "light", room = "0";

            this.updateProperty(device, room, unit, state);
        } catch (error) {
            if (error instanceof ReferenceError) return;

            logger.error(`failed to retrieve server light command: ${error}`);
        }
    }

    async serverEvCommand(url, json) {
        logger.debug(`server ev command ===> ${JSON.stringify(url)}`);

        try {
            const response = await axios(url);

            logger.info(`server ev command  <=== ${JSON.stringify(response.data)}`);
            if (response.data.result === 'ok') {
                logger.info('server elevator command request successful!');
                this.getServerEVStatus(json, response.data);
            } else {
                logger.info('server elevator command request fail!');
            }
        } catch (error) {
            if (error instanceof ReferenceError) return;

            logger.error(`failed to retrieve server ev command: ${error}`);
        }
    }

};


new BestinRS485();
