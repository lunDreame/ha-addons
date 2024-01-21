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
    HEMSELEM,
    HEMSMAP,
    HEMSUNIT,
    DISCOVERY_DEVICE,
    DISCOVERY_PAYLOAD,

    V1LOGIN,
    V2LOGIN,
    V1LIGHTSTATUS,
    V2LIGHTCOSTEX,
    V2LIGHTSTATUS,
    V1LIGHTCMD,
    V2LIGHTCMD,
    V2SLIGHTCMD,
    V2ELEVATORCMD,
    format,
    deepCopyObject,
    recursiveFormatWithArgs,
    findVentTempValue,
    ventPercentage,
    lightPosPow,
} = require('./srv/const.js');

const DEVICE_INFO = [
    //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////// COMMAND

    // LIGHT
    {
        device: 'light', header: ['02310D01', '02000A12'], length: [13, 10], request: 'set',
        setPropertyToMsg: (buf, rom, idx, val) => {
            let ngway = buf.slice(2, 4).toString('hex') === '0a12', onff = (val == "ON" ? 0x01 : 0x00), roid = 0x50 + Number(rom);
            let id = idx.slice(-1) - 1, pos = (val === "ON" ? 0x80 : 0x00), onff2 = (val === "ON" ? 0x04 : 0x00);

            buf[5] = ngway ? onff : rom & 0x0F;
            buf[6] = ngway ? lightPosPow(id) : (0x01 << id | pos);
            if (ngway) buf[1] = roid; else buf[11] = onff2
            return buf;
        }
    },

    // OUTLET
    {
        device: 'outlet', header: ['02310D01', '02000C12'], length: [13, 12], request: 'set',
        setPropertyToMsg: (buf, rom, idx, val) => {
            let ngway = buf.slice(2, 4).toString('hex') === '0c12', onff = (val == "ON" ? 0x01 : 0x02), roid = 0x50 + Number(rom);
            let id = idx.slice(-1) - 1, pos = (val === "ON" ? 0x80 : 0x00), onff2 = (val === "ON" ? 0x09 << id : 0x00);

            if (ngway) buf[1] = roid; else buf[5] = rom & 0x0F
            if (!ngway && idx === "standby") buf[8] = (val === "ON" ? 0x83 : 0x03);
            else if (ngway) buf[8] = 0x01, buf[9] = id + 1 & 0x0F, buf[10] = (idx.length === 8 ? onff >> onff + 3 : onff); else buf[7] = (0x01 << id | pos), buf[11] = onff2
            return buf;
        }
    },

    // THERMOSTAT
    {
        device: 'thermostat', header: '02280E12', length: 14, request: 'set',
        setPropertyToMsg: (buf, rom, idx, val) => {
            let value = parseFloat(val), vInt = parseInt(value), vFloat = value - vInt;

            buf[5] = rom & 0x0F;
            if (idx === "power") buf[6] = (val === "heat" ? 0x01 : 0x02);
            else buf[7] = ((vInt & 0xFF) | ((vFloat != 0) ? 0x40 : 0x00));
            return buf;
        }
    },

    // FAN
    {
        device: 'fan', header: '026100', length: 10, request: 'set',
        setPropertyToMsg: (buf, rom, idx, val) => {
            if (idx === "power") buf[2] = 0x01, buf[5] = (val === "ON" ? 0x01 : 0x00), buf[6] = 0x01;
            else buf[2] = 0x03, buf[6] = findVentTempValue(val);
            return buf;
        }
    },

    // GAS
    {
        device: 'gas', header: '023102', length: 10, request: 'set', forceCommand: 'OFF',
        setPropertyToMsg: (buf, rom, idx, val) => {
            return buf;
        }
    },

    //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////// STATE

    // LIGHT
    {
        device: 'light', header: ['02311E91', '021491'], length: [30, 20], request: 'ack',
        parseToProperty: (buf) => {
            let props = [];
            if (buf.slice(2, 4).toString('hex') !== '1491') {
                for (let i = 0; i < ((buf[5] & 0x0F) === 1 ? 4 : 2); i++) {
                    props.push({ device: 'light', room: buf[5] & 0x0F, value: { [`power${i + 1}`]: (buf[6] & (1 << i)) ? "ON" : "OFF" } });
                }
            } else {
                for (let i = 0; i < buf[5]; i++) {
                    props.push({ device: 'light', room: buf[1] & 0x0F, value: { [`power${i + 1}`]: (buf[6] & (1 << i)) ? "ON" : "OFF" } });
                }
            }
            return props;
        }
    },

    // OUTLET
    {
        device: 'outlet', header: ['02311E91', '021491'], length: [30, 20], request: 'ack',
        parseToProperty: (buf) => {
            let props = [];
            if (buf.slice(2, 4).toString('hex') !== '1491') {
                for (let i = 0; i < ((buf[5] & 0x0F) === 1 ? 3 : 2); i++) {
                    props.push({
                        device: 'outlet', room: buf[5] & 0x0F,
                        value: { [`power${i + 1}`]: (buf[7] & (1 << i)) ? "ON" : "OFF", [`usage${i + 1}`]: (buf[14 + 2 * i] << 8 | buf[14 + 2 * i + 1]) / 10 || 0, 'standby': (buf[7] >> 4 & 1) ? "ON" : "OFF" }
                    });
                }
            } else {
                for (let i = 0; i < buf[7]; i++) {
                    props.push({
                        device: 'outlet', room: buf[1] & 0x0F,
                        value: { [`power${i + 1}`]: (buf[9 + i * 5] & 0x0F) ? "ON" : "OFF", [`usage${i + 1}`]: (buf[10 + 5 * i] << 8 | buf[10 + 5 * i + 1]) / 10 || 0, [`standby${i + 1}`]: (buf[9 + i * 5] >> 4 & 1) ? "ON" : "OFF" }
                    });
                }
            }
            return props;
        }
    },

    // THERMOSTAT
    {
        device: 'thermostat', header: '02281091', length: 16, request: 'ack',
        parseToProperty: (buf) => {
            return {
                device: 'thermostat', room: buf[5] & 0x0F,
                value: { 'power': (buf[6] & 0x01) ? "heat" : "off", 'target': (buf[7] & 0x3F) + ((buf[7] & 0x40) && 0.5), 'current': ((buf[8] << 8) + buf[9]) / 10.0 }
            };
        }
    },

    // FAN
    {
        device: 'fan', header: '026180', length: 10, request: 'ack',
        parseToProperty: (buf) => {
            return {
                device: 'fan', value: { 'power': (buf[5] ? "ON" : "OFF"), 'percent': ventPercentage(buf[6]) }
            };
        }
    },

    // GAS
    {
        device: 'gas', header: '023180', length: 10, request: 'ack',
        parseToProperty: (buf) => {
            return {
                device: 'gas', value: { 'power': (buf[5] ? "ON" : "OFF") }
            };
        }
    },

    // ENERGY
    {
        device: 'energy', header: ['02D13082', '02D12282'], length: [48, 34], request: 'ack',
        parseToProperty: (buf) => {
            let props = [], i = 13;

            if (buf.slice(2, 4).toString('hex') !== '2282') {
                for (const h of HEMSELEM) {
                    props.push({
                        device: 'energy', room: h,
                        value: { 'total': parseInt(buf.slice(HEMSMAP[h][0], HEMSMAP[h][1]).toString('hex')), 'realt': parseInt(buf.slice(i, i + 2).toString('hex')) }
                    });
                    i += 8;
                }
            } else {
                for (const h of ["electric", "water", "gas"]) {
                    props.push({ device: 'energy', room: h, value: { 'realt': parseInt(buf.slice(i, i + 2).toString('hex')) } });
                    i += 8;
                }
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
        this.setCommandBufferIndex = 0;

        this.mqttClient = this.createMqttClient();
        this.mqttPrefix = options.mqtt.prefix;
        this.energyConnection = this.createConnection(options.energy, 'energy');
        this.controlConnection = this.createConnection(options.control, 'control');

        if (options.server_enable) {
            // HDC server instance creates
            this.serverCreate(options.server_type);

            this.shouldRegisterSrvEV = options.server_enable && options.server_type === "v2";
            this.hasSmartLighting = options.smart_lighting;
            this.isServerEnabled = options.server_enable;
        }
    }

    createMqttClient() {
        const client = mqtt.connect({
            host: options.mqtt.broker,
            port: options.mqtt.port,
            ...(options.mqtt.username && options.mqtt.password ? { username: options.mqtt.username, password: options.mqtt.password } : {}),
        });

        client.on('connect', () => {
            logger.info("MQTT connection successful!");
            this.isMqttConnected = true;

            const topic = `${this.mqttPrefix}/+/+/+/command`;
            client.subscribe(topic);

            if (this.shouldRegisterSrvEV && fs.existsSync('./session.json')) {
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
        if (topics[0] !== this.mqttPrefix) {
            return;
        }
        logger.info(`recv. message: ${topic} = ${value}`);

        if (!this.isServerEnabled || !this.checkSessionFile()) return;

        if (this.isServerEnabled && this.checkSessionFile()) {
            json = this.checkSessionFile();
        }

        if ((topics[2] === "0" && ['light', 'slight'].includes(topics[1])) || topics[1] === "elevator") {
            this.serverCommand(topics, value, json);
        } else {
            const [device, room, name] = topics.slice(1, 4);
            const { energyPacketTimeStamp, controlPacketTimeStamp } = this;
            const timeStamp = ['light', 'outlet'].includes(device) ? energyPacketTimeStamp : controlPacketTimeStamp;

            this.setCommandProperty(device, room, name, value, timeStamp?.[1] || 0x0);
        }
    }

    checkSessionFile() {
        const filePath = './session.json';

        try {
            if (!fs.existsSync(filePath)) {
                logger.warn('session.json file does not exist');
                return false;
            }

            const fileData = fs.readFileSync(filePath, 'utf-8').trim();

            if (!fileData) {
                logger.warn('no data in the session.json file.');
                return false;
            }

            const jsonData = JSON.parse(fileData);

            if (Object.keys(jsonData).length === 0) {
                logger.warn('session.json file empty JSON object');
                return false;
            }

            return jsonData;
        } catch (error) {
            logger.error(`unable to read file or JSON parsing error: ${error.message}`);
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
        this.mqttClient.publish(topic, value.toString(), { retain: true });
    }

    formatDiscovery(device, room, name) {
        const isOutletOrElevator = ['outlet', 'elevator'].includes(device);

        for (const payloadTemplate of DISCOVERY_PAYLOAD[device]) {
            let payload = { ...payloadTemplate };

            if (isOutletOrElevator) {
                const isSwitch = ['call', 'power', 'standby'].includes(name.replace(/\d+/g, ''));
                const isSensor = !isSwitch;

                payload['_intg'] = isSwitch ? "switch" : "sensor";
                if (device === "outlet") {
                    if (isSensor) { payload['unit_of_meas'] = "W"; payload['dev_cla'] = "power"; }
                    payload['ic'] = isSensor ? "mdi:lightning-bolt" : "mdi:power-socket-eu";
                }
            }

            payload['~'] = format(payload['~'], this.mqttPrefix, room, name);
            payload['name'] = format(payload['name'], this.mqttPrefix, room, name.replace(/power|switch/g, ''));

            if (device === 'energy') {
                const measurementUnit = HEMSUNIT[room + '_' + name];

                payload['unit_of_meas'] = measurementUnit[0];
                if (measurementUnit[1]) payload['dev_cla'] = measurementUnit[1];
                if (measurementUnit[2]) payload['val_tpl'] = measurementUnit[2];
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
        this.mqttClient.publish(topic, JSON.stringify(payload), { retain: true });
    }

    validateChecksum(packet) {
        let checksum = 3;

        for (let i = 0; i < packet.length - 1; i++) {
            checksum ^= packet[i];
            checksum = (checksum + 1) & 0xFF;
        }
        if (checksum !== packet[packet.length - 1]) {
            logger.error(`checksum error: ${packet.toString('hex')}, ${checksum.toString(16)}`);

            return false;
        }
        return true;
    }

    calculateChecksum(packet) {
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
        if (options.rs485.single_comm && serialName === "control") {
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

            this.serial.on('data', (buffer) => {
                this.findAndSplitBuffer(buffer);
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

            this.socket.on('data', (buffer) => {
                this.findAndSplitBuffer(buffer);
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

    findAndSplitBuffer(buffer) {
        const headerBuffer = Buffer.concat([buffer.slice(0, 2)]);
        let indexOfHeader = buffer.indexOf(headerBuffer, 2);

        while (indexOfHeader !== -1) {
            for (let i = 0; i < 2; i++) {
                let start, end;

                if (i === 0) {
                    start = 0;
                    end = indexOfHeader;
                } else {
                    start = indexOfHeader;
                    end = buffer.length;
                }
                const packetBuffer = buffer.slice(start, end);
                this.handlePacket(packetBuffer);
            }

            buffer = buffer.slice(indexOfHeader + headerBuffer.length);
            indexOfHeader = buffer.indexOf(headerBuffer, 2);
        }
    }

    handlePacket(packet) {
        // console.log('recive packet:', packet.toString('hex'))
        this.lastReceivedTimestamp = new Date();
        this.isCommandIndex = false;

        // if (packet[0] === 0x02) {
        //    this.synchronizedTime = this.lastReceivedTimestamp;
        // }
        if (!this.isCommandIndex && packet.slice(2, 4).toString('hex') === '1491') {
            this.setCommandBufferIndex = 1;
            this.isCommandIndex = true;
        }

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
            this.updatePropertiesFromMessage(msgInfo, packet, foundIdx[0] > -1);
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

        const gatewayHeaderType = actualHeader.includes('1491') ? '021491' : actualHeader;

        const validMsgInfos = DEVICE_INFO.filter(({ header, length, parseToProperty }) => {
            const headerIsArray = Array.isArray(header) ? header.includes(gatewayHeaderType) : header === actualHeader;
            const lengthIsArray = Array.isArray(length) ? length.includes(actualLength) : length === actualLength;

            if (headerIsArray && lengthIsArray && parseToProperty) return actualHeader;
        });

        const receivedMsg = {
            code,
            codeHex,
            count: 0,
            validMsgInfos,
        };
        receivedMessages.push(receivedMsg);
        return receivedMsg;
    }

    findCommandIndex(packet) {
        const { serialCommandQueue, setCommandBufferIndex } = this;
        let ackPacket = "";
        let foundIdx = -1;

        for (let i = 0; i < serialCommandQueue.length; i++) {
            const { cmdHex } = serialCommandQueue[i];
            const secondByte = cmdHex[1];
            const iOffset = (setCommandBufferIndex === 0 && cmdHex.length === 10) ? 2 : 3;
            const ackHex = ((secondByte === 0x28 || setCommandBufferIndex === 1 ? 0x9 : 0x8) << 4) | (cmdHex[iOffset] & 0x0F);
            const packetI = packet[iOffset];

            // console.log(`packet: ${packet.toString('hex')}, iOffset: ${iOffset}, secondByte: ${secondByte}`)
            // console.log(`secondByte: ${secondByte.toString(16)}, ackHex: ${ackHex.toString(16)}, packetI: ${packetI.toString(16)}`);
            if (secondByte === packet[1] && ackHex === packetI) {
                ackPacket = packet.toString('hex');
                foundIdx = i;
                break;
            }
        }
        return { foundIdx, ackPacket };
    }

    updatePropertiesFromMessage(msgInfo, packet, isCommandResponse) {
        if (!msgInfo || Object.keys(msgInfo).length === 0) return;
        const parsedProperties = (msgInfo.parseToProperty && packet) ? msgInfo.parseToProperty(packet) : msgInfo;

        if (Array.isArray(parsedProperties)) {
            for (const parsedProperty of parsedProperties) {
                const { device, room = 0, value } = parsedProperty;
                this.updateProperties(device, room, value, isCommandResponse);
            }
        } else {
            const { device, room = 0, value } = parsedProperties;
            this.updateProperties(device, room, value, isCommandResponse);
        }
    }

    updateProperties(device, room, properties, isCommandResponse) {
        for (const [propertyName, propertyValue] of Object.entries(properties)) {
            this.updatePropertyValues(device, room, propertyName, propertyValue, isCommandResponse);
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

        let writeHandle = {
            light: this.energyConnection,
            outlet: this.energyConnection,
            fan: this.controlConnection,
            gas: this.controlConnection,
            thermostat: this.controlConnection,
        }[serialCmd.device];

        if (options.rs485.single_comm) {
            writeHandle.fan = this.energyConnection;
            writeHandle.gas = this.energyConnection;
            writeHandle.thermostat = this.energyConnection;
        }
        if (this.setCommandBufferIndex === 1) {
            writeHandle.gas = this.energyConnection;
        }

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
            logger.error(`command(${serialCmd.device}) max retry number exceeded!`);
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

    setCommandProperty(device, room, name, value, timeStamp, callback) {
        const deviceInfo = DEVICE_INFO.find(entry => entry.setPropertyToMsg && entry.device === device);

        if (!deviceInfo) {
            logger.warn(`Unknown device:    ${device}`);
            return;
        }

        if (deviceInfo.forceCommand !== undefined && deviceInfo.forceCommand !== value) {
            logger.warn(`unknown command:   ${device}`);
            return;
        }

        if (!value) {
            logger.warn(`no payload:    ${device}`);
            return;
        }
        const devInfoHeader = Array.isArray(deviceInfo.header) ? deviceInfo.header[this.setCommandBufferIndex] : deviceInfo.header;
        const devInfoLength = Array.isArray(deviceInfo.length) ? deviceInfo.length[this.setCommandBufferIndex] : deviceInfo.length;

        const headerBuffer = Buffer.from(devInfoHeader + timeStamp.toString(16), 'hex');
        const restBuffer = Buffer.alloc(devInfoLength - headerBuffer.length);
        const commandBuffer = this.createCommandBuffer(headerBuffer, restBuffer, deviceInfo, room, name, value);

        commandBuffer[devInfoLength - 1] = this.calculateChecksum(commandBuffer);

        this.addCommandToQueue(commandBuffer, device, room, name, value, callback);
    }

    createCommandBuffer(headerBuffer, restBuffer, deviceInfo, room, name, value) {
        const commandBuffer = Buffer.concat([headerBuffer, restBuffer]);
        deviceInfo.setPropertyToMsg(commandBuffer, room, name, value);
        return commandBuffer;
    }

    updatePropertyValues(device, room, name, value, force) {
        const propertyKey = device + room + name;
        const isSamePropertyValue = !force && this.deviceStatusCache[propertyKey] === value;
        if (isSamePropertyValue) return;

        this.deviceStatusCache[propertyKey] = value;

        let deviceStatus = this.deviceStatusArray.find(o => o.device === device && o.room === room);
        if (!deviceStatus) {
            deviceStatus = this.putStatusProperty(device, room);
        }
        deviceStatus.property[name] = value;

        // client update
        this.updateMqttClient(device, room, name, value);
        // mqtt discovery
        this.performDiscovery(device, room, name);
    }

    performDiscovery(device, room, name, discoveryTimeout = 20000) {
        const formatAndExecuteDiscovery = () => {
            if (!this.discoveryScheduled && options.mqtt.discovery) {
                this.formatDiscovery(device, room, name);
            }
        }

        const discoveryImmediate = setImmediate(formatAndExecuteDiscovery);

        setTimeout(() => {
            clearImmediate(discoveryImmediate);
            this.discoveryScheduled = true;
        }, discoveryTimeout);
    }


    ////////////////////////////////////////////////////////////////////////////////////////
    // HDC Server

    serverCreate(type) {
        const loginUrl = type === "v1"
            ? recursiveFormatWithArgs(V1LOGIN, options.server.address, options.server.username, options.server.password)
            : recursiveFormatWithArgs(V2LOGIN, options.server.uuid);

        const loginFunc = type === "v1" ? this.serverLogin.bind(this) : this.serverLogin2.bind(this);

        loginFunc('login', loginUrl);
        setInterval(loginFunc, 3600000, 'refresh', loginUrl);
    }

    async serverLogin2(session, url) {
        logger.debug(`server2 login ===> ${JSON.stringify(url)}`);

        try {
            const response = await axios(url);

            if (session === "refresh") logger.info("server2 session refreshing...");

            if (response.status !== 500) {
                //logger.debug(`server2 login <=== ${JSON.stringify(response.data)}`);
                logger.info(`server2 session ${session} successful!`);

                this.loginManagement(response.data, 'v2', session);
            }
        } catch (error) {
            if (error instanceof ReferenceError) return;

            logger.error(`server2 login fail. return with: ${error}`);
        }
    }

    async serverLogin(session, url) {
        logger.debug(`server login ===> ${JSON.stringify(url)}`);

        try {
            const response = await axios(url);

            if (session === "refresh") logger.info("server session refreshing...");

            if (response.data.ret === "success") {
                //logger.debug(`server login <=== ${JSON.stringify(response.data)}`);
                logger.info(`server session ${session} successful!`);

                this.loginManagement(response, 'v1', session);
            } else {
                logger.info(`server session ${session} fail. [${response.data.ret}]`);
            }
        } catch (error) {
            if (error instanceof ReferenceError) return;

            logger.error(`server login fail. return with: ${error}`);
        }
    }

    loginManagement(res, type, session) {
        const isV1 = type === "v1";
        this.isCostLightV2 = false;

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
            if (session === "login") {
                logger.info(`session.json file write successful!`);
            }
        } catch (error) {
            logger.error(`create session.json file error: ${error.message}`);
        }

        const json = this.checkSessionFile();

        let lightingType = this.hasSmartLighting ? "smartlight" : "livinglight";
        if (V2LIGHTCOSTEX.includes(json.url) && lightingType === "livinglight") {
            lightingType = "light";
            this.isCostLightV2 = true;
        }

        const statusUrl = isV1
            ? recursiveFormatWithArgs(V1LIGHTSTATUS, options.server.address, json.phpsessid, json.userid, json.username)
            : recursiveFormatWithArgs(V2LIGHTSTATUS, json.url, lightingType, json['access-token']);

        this.getServerLightStatus(statusUrl, type, 'state');

        if (options.server.scan_interval !== 0) {
            setInterval(() => { this.getServerLightStatus(statusUrl, type, 'refresh'); }, options.server.scan_interval * 1000);
        }
    }

    async getServerLightStatus(url, type, session) {
        logger.debug(`server lighting status ===> ${JSON.stringify(url)}`);

        try {
            const response = await axios(url);
            const result = this.serverRequestResult(type, response.data);

            //logger.debug(`server lighting status <=== ${JSON.stringify(response.data)}`);

            if (result === "ok") {
                //logger.debug(`server lighting status <=== ${JSON.parse(JSON.stringify(response.data))}`);
                logger.info('server light status request successful!');

                type === "v1" ? this.parseXmlLightStatus(response.data) : this.parseJsonLightStatus(response.data);
            } else {
                logger.warn(`failed to update lighting status. Result: ${result}`);
            }
            /** If the response value is empty, the session is considered expired and you attempted to reconnect,
            but the function runs, but the response variable is not resolvable, so it is pending. */
        } catch (error) {
            if (error instanceof ReferenceError) return;

            logger.error(`failed to retrieve server light status: ${error}`);
        }
    }

    serverRequestResult(type, response, resultData = "") {
        const xmltoStr = () => xml2js.parseString(response, (err, result) => {
            if (err) {
                logger.error(`failed to parse XML server result status: ${err}`);
                return;
            }
            resultData = result.imap.service[0].$.result;
        });
        type === "v1" ? xmltoStr() : resultData = response.result;

        return resultData;
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
                const deviceProps = { device: 'light', room: '0', value: { [status.$.unit_num]: status.$.unit_status.toUpperCase() } };

                this.updatePropertiesFromMessage(deviceProps);
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
            return;
        }

        const units = this.hasSmartLighting ? jsonData.map[0].units : jsonData.units;
        if (!units) {
            logger.warn("failed to parse JSON light status: 'units' property not found");
            return;
        }

        this.smartLightDataArray = [];

        const processUnit = (unit) => {
            let deviceProps = { device: '', room: '0', value: {} };

            if (this.hasSmartLighting && unit.dimming !== 'null') {
                /** smart lighting factor verification required (dimming? color?) */
                deviceProps = {
                    device: 'slight',
                    value: { [`switch${unit.unit}`]: unit.state.toUpperCase(), brightness: unit.dimming, colorTemp: this.mapColorValueInRange(unit.color, 1, 10, 500, 153) }
                };
            } else {
                deviceProps = { device: 'light', value: { [`switch${unit.unit}`]: unit.state.toUpperCase() } };
            }

            this.smartLightDataArray.push(unit);
            this.updatePropertiesFromMessage(deviceProps);
        };

        if (Array.isArray(units)) {
            for (const unit of units) {
                processUnit(unit);  // if the living room light is one smart light or one smart light, the other general light
            }
        } else {
            processUnit(units);
        }
    }

    getServerEVStatus(json, response, address,) {
        const es = new EventSource(`${json.url}/v2/admin/elevators/sse`);

        const handleEventInfo = (event,) => {
            const data = JSON.parse(event.data);
            if (data.address !== address) return;

            if (data.move_info) {
                this.elevatorEventArray = [data.move_info.Serial || 0, data.move_info.MoveDir || '대기', data.move_info.Floor || '대기 층'];
                this.elevatorCallSuccess = (response.result === "ok") ? "OFF" : "ON";
                var deviceProps = {
                    device: 'elevator', room: this.elevatorEventArray[0],
                    value: { 'call': this.elevatorCallSuccess, 'direction': this.elevatorEventArray[1], 'floor': this.elevatorEventArray[2] }
                };
            } else if (this.elevatorEventArray?.[0]) {
                deviceProps = {
                    device: 'elevator', room: this.elevatorEventArray[0],
                    value: { 'direction': '도착', 'floor': 'arrived' }
                };
                cleaerEventListener();
            }

            this.updatePropertiesFromMessage(deviceProps);
        };

        const cleaerEventListener = () => {
            es.removeEventListener('moveinfo', handleEventInfo);
            es.removeEventListener('arrived', handleEventInfo);
            es.close();
        };

        es.addEventListener('moveinfo', handleEventInfo);
        es.addEventListener('arrived', handleEventInfo);

        es.onerror = (error) => {
            logger.error(`EventSource elevator error occurred: ${error}`);
            es.close();
        };
    }

    serverCommand(topic, value, json) {
        if (topic[1] === "light" || (topic[1] === "slight" && this.smartLightDataArray?.length > 0)) {
            this.serverLightCommand(topic[1], topic[3], value, options.server_type, json);
        } else if (topic === "elevator" || topic[1] === "elevator") {
            const evUrl = recursiveFormatWithArgs(V2ELEVATORCMD, json.url, options.server.address, options.server.uuid);
            const msg = "elevator calls through the server are supported only in v2 version!";
            this.shouldRegisterSrvEV ? this.serverEvCommand(evUrl, json) : logger.error(msg);
        }
    }

    slightDataCopy(param, unit, state) {
        if ("switch" === unit.replace(/\d+/g, '')) {
            param['state'] = state;
        }
        if ("brightness" === unit) {
            param['dimming'] = state;
        }
        if ("colorTemp" === unit) {
            param['color'] = this.mapColorValueInRange(state, 500, 153, 1, 10);
        }
        return param;
    }

    serverlightCommandManager(stype, unit, state, type, json, url) {
        if (type === 'v1') {
            url = recursiveFormatWithArgs(V1LIGHTCMD, options.server.address, json.phpsessid, json.userid, json.username, unit, state);
        } else {
            if (this.hasSmartLighting) {
                const smartLightData = this.slightDataCopy(this.smartLightDataArray?.find(item => item.unit === (stype === 'slight' ? '1' : unit.slice(-1))), unit, state);

                url = recursiveFormatWithArgs(V2SLIGHTCMD, json.url, JSON.stringify(smartLightData), json['access-token']);
            } else {
                if (this.isCostLightV2) url = recursiveFormatWithArgs(V2LIGHTCMD, json.url, "light", "1", unit, state, json['access-token']);
                else url = recursiveFormatWithArgs(V2LIGHTCMD, json.url, "livinglight", unit.slice(-1), unit, state, json['access-token']);
            }
        }

        return deepCopyObject(url);
    }

    async serverLightCommand(stype, unit, state, type, json) {
        const url = this.serverlightCommandManager(stype, unit, state, type, json);

        logger.debug(`server lighting command ===> ${JSON.stringify(url)}`);

        try {
            const response = await axios(url);
            const result = this.serverRequestResult(type, response.data);

            if (result !== "ok") {
                logger.warn(`failed to server lighting command. Result: ${result}`);
                return;
            }
            //logger.debug(`server lighting command <=== ${JSON.parse(JSON.stringify(response.data))}`);
            logger.info("server livinglight command request successful!");

            const deviceProps = { device: stype, room: '0', value: { [unit]: state } };

            this.updatePropertiesFromMessage(deviceProps);
        } catch (error) {
            if (error instanceof ReferenceError) return;

            logger.error(`failed to retrieve server light command: ${error}`);
        }
    }

    async serverEvCommand(url, json) {
        if (!url.data.address) {
            logger.warn("please check the server.address of the add-on configuration");
            return;
        }
        logger.debug(`server ev command ===> ${JSON.stringify(url)}`);

        try {
            const response = await axios(url);

            //logger.info(`server ev command  <=== ${JSON.stringify(response.data)}`);
            if (response.data.result === 'ok') {
                logger.info('server elevator command request successful!');
                this.getServerEVStatus(json, response.data, url.data.address);
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
