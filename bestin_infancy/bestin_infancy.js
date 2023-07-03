/** 
 * @fileoverview bestin_infancy.js
 * @description bestin_infancy.js
 * @version 1.2.0
 * @license MIT
 * @author harwin1
 * @date 2023-03-01
 * @lastUpdate 2023-03-01
 */

const net = require('net');
const SerialPort = require('serialport').SerialPort;
const mqtt = require('mqtt');

// 커스텀 파서
const Transform = require('stream').Transform;
const CONFIG = require('/data/options.json');

// 로그 표시 
const log = (...args) => console.log('[' + (new Date()).toLocaleString() + ']', 'INFO     ', args.join(' '));
const warn = (...args) => console.log('[' + (new Date()).toLocaleString() + ']', 'WARNING  ', args.join(' '));
const error = (...args) => console.log('[' + (new Date()).toLocaleString() + ']', 'ERROR    ', args.join(' '));

const MSG_INFO = [
    /////////////////////////////////////////////////////////////////////////////
    //command <-> response
    {                    
        device: 'light', header: 0x50, command: 0x12, length: 10, request: 'set',
        setPropertyToMsg: (b, r, n, v) => {
            let id = n.replace(/[^0-9]/g, "");
            b[1] = b[1] + r;
            b[5] = (v == 'on' ? 0x01 : 0x00);
            b[6] = id & 0x0F;
            return b;
        }
    },

    {
        device: 'outlet', header: 0x50, command: 0x12, length: 13, request: 'set',
        setPropertyToMsg: (b, r, n, v) => {
            let id = n.replace(/[^0-9]/g, "");
            b[1] = b[1] + r;
            b[8] = 0x01;
            b[9] = id & 0x0F;
            b[10] = (v == 'on' ? 0x01 : 0x02);
            return b;
        }
    },

    {
        device: 'thermostat', header: 0x28, command: 0x12, length: 14, request: 'set',
        setPropertyToMsg: (b, r, n, v) => {
            b[5] = r & 0x0F, b[6] = (v == 'heat' ? 0x01 : 0x02);
            return b;
        }
    },

    {
        device: 'thermostat', header: 0x28, command: 0x12, length: 14, request: 'set',
        setPropertyToMsg: (b, r, n, v) => {
            b[5] = r & 0x0F, val = parseFloat(v), vInt = parseInt(val), vFloat = val - vInt;
            b[7] = ((vInt & 0xFF) | ((vFloat != 0) ? 0x40 : 0x00));
            return b;
        }
    },

    {
        device: 'ventil', header: 0x61, command: '', length: 10, request: 'set',
        setPropertyToMsg: (b, r, n, v) => {
            if (n == 'power') b[2] = 0x01, b[5] = (v == 'on' ? 0x01 : 0x00), b[6] = 0x01;
            else if (n == 'preset') b[2] = 0x03, b[6] = Number(v);
            return b;
        }
    },

    {
        device: 'gas', header: 0x31, command: 0x02, length: 10, request: 'set',
        setPropertyToMsg: (b, r, n, v) => {
            return b;
        }
    },

    /////////////////////////////////////////////////////////////////////////////
    //query <-> response
    {
        device: 'light', header: 0x50, command: 0x91, length: 20, request: 'ack',
        parseToProperty: (b) => {
            var propArr = []; let roomId = b[1].toString(16).substr(1);
            let num = roomId == 1 ? 5 : 2
            for (let i = 0; i < num; i++) {
                propArr.push({
                    device: 'light', roomIdx: roomId, propertyName: 'power' + (i + 1),
                    propertyValue: ((b[6] & (1 << i)) ? 'on' : 'off'),
                });
            }
            return propArr;
        }
    },

    {
        device: 'outlet', header: 0x50, command: 0x91, length: 20, request: 'ack',
        parseToProperty: (b) => {
            var propArr = []; let roomId = b[1].toString(16).substr(1);
            for (let i = 0; i < 2; i++) {
                consumption = b.length > (i1 = 10 + 5 * i) + 2 ? parseInt(b.slice(i1, i1 + 2).toString('hex'), 16) / 10 : 0;
                propArr.push({
                    device: 'outlet', roomIdx: roomId, propertyName: 'power' + (i + 1),
                    propertyValue: ((b[9] & (1 << i)) ? 'on' : 'off'),
                }, {
                    device: 'outlet', roomIdx: roomId, propertyName: 'usage' + (i + 1),
                    propertyValue: consumption,
                });
            }
            return propArr;
        }
    },

    {
        device: 'thermostat', header: 0x28, command: 0x91, length: 16, request: 'ack',
        parseToProperty: (b) => {
            let roomId = b[5] & 0x0F;
            return [
                { device: 'thermostat', roomIdx: roomId, propertyName: 'mode', propertyValue: (b[6] & 0x01) ? 'heat' : 'off' },
                { device: 'thermostat', roomIdx: roomId, propertyName: 'setting', propertyValue: (b[7] & 0x3F) + ((b[7] & 0x40) > 0) * 0.5 },
                { device: 'thermostat', roomIdx: roomId, propertyName: 'current', propertyValue: (b[8] << 8) + b[9] / 10.0 },
            ];
        }
    },

    {
        device: 'ventil', header: 0x61, command: 0x80, length: 10, request: 'ack',
        parseToProperty: (b) => {
            return [
                { device: 'ventil', roomIdx: 1, propertyName: 'power', propertyValue: (b[5] ? 'on' : 'off') },
                { device: 'ventil', roomIdx: 1, propertyName: 'preset', propertyValue: b[6].toString().padStart(2, '0') },
            ];
        }
    },

    {
        device: 'gas', header: 0x31, command: 0x80, length: 10, request: 'ack',
        parseToProperty: (b) => {
            return [{ device: 'gas', roomIdx: 1, propertyName: 'power', propertyValue: (b[5] ? 'on' : 'off') }];
        }
    },

];

class CustomParser extends Transform {
    constructor(options) {
        super(options);
        this.reset();
    }

    reset() {
        this._queueChunk = [];
        this._lenCount = 0;
        this._length = undefined;
        this._typeFlag = false;
        this._prefix = 0x02;
        this._headers = [0x51, 0x52, 0x53, 0x54, 0x17, 0x31, 0x28, 0x61];
    }

    _transform(chunk, encoding, done) {
        let start = 0;
        for (let i = 0; i < chunk.length; i++) {
            if (this._prefix === chunk[i] && this._headers.includes(chunk[i + 1])) {
                this.push(Buffer.concat(this._queueChunk));
                this._queueChunk = [];
                start = i;
                this._typeFlag = true;
            } else if (this._typeFlag) {
                const expectedLength = this.expectedLength(chunk, i);
                //console.log(expectedLength);
                if (expectedLength) {
                    this._length = expectedLength;
                    this._typeFlag = false;
                } else {
                    this.reset();
                    return done();
                }
            }

            if (this._lenCount === this._length - 1) {
                this._queueChunk.push(chunk.slice(start, i + 1));
                this.push(Buffer.concat(this._queueChunk));
                this._queueChunk = [];
                start = i + 1;
            } else {
                this._lenCount++;
            }
        }
        this._queueChunk.push(chunk.slice(start));
        done();
    }

    _flush(done) {
        this.push(Buffer.concat(this._queueChunk));
        this.reset();
        done();
    }

    expectedLength(packet, index) {
        const secondByte = packet[index];
        const thirdByte = packet[index + 1];

        if ([0x31, 0x61, 0x17].includes(secondByte)) {
            return 10;
        } else {
            return thirdByte;
        }
    }
}


class rs485 {
    constructor() {
        this._receivedMsgs = [];
        this._deviceReady = false;
        this._lastReceive = new Date();
        this._commandQueue = new Array();
        this._serialCmdQueue = new Array();
        this._deviceStatusCache = {};
        this._deviceStatus = [];
        this._timestamp = undefined;
        this._connection = undefined;
        this._mqttPrefix = CONFIG.mqtt.prefix;
        this._discovery = false;

        this._mqttClient = this.mqttClient();
        this._connDevice = this.createConnection();
    }

    mqttClient() {
        const client = mqtt.connect(`mqtt://${CONFIG.mqtt.broker}`, {
            port: CONFIG.mqtt.port,
            username: CONFIG.mqtt.username,
            password: CONFIG.mqtt.password,
            clientId: 'BESTIN_WALLPAD',
        });

        client.on("connect", () => {
            log("MQTT connection successful!");
            this._deviceReady = true; // mqtt 연결 성공하면 장치 준비 완료
            const topics = ["bestin/+/+/+/command", "homeassistant/status"];
            topics.forEach(topic => {
                client.subscribe(topic, (err) => {
                    if (err) {
                        error(`failed to subscribe to ${topic}`);
                    }
                });
            });
        });

        client.on("error", (err) => {
            error(`MQTT connection error: ${err}`);
            this._deviceReady = false;
        });

        client.on("reconnect", () => {
            warn("MQTT connection lost. try to reconnect...");
        });
        log("initializing mqtt...");

        // ha에서 mqtt로 제어 명령 수신
        client.on("message", this.mqttCommand.bind(this));
        return client;
    }

    mqttCommand(topic, message) {
        if (!this._deviceReady) {
            warn("MQTT is not ready yet");
            return;
        }
        const topics = topic.split("/");
        const value = message.toString();
        if (topics[0] !== this._mqttPrefix) {
            return;
        }
        const [device, roomIdx, propertyName] = topics.slice(1, 4);
        this.setCommandProperty(device, roomIdx, propertyName, value);
    }

    mqttClientUpdate(device, roomIdx, propertyName, propertyValue) {
        if (!this._deviceReady) {
            return;
        }
        const topic = `${this._mqttPrefix}/${device}/${roomIdx}/${propertyName}/state`;

        if (typeof (propertyValue) !== 'number') {
            log(`publish mqtt: ${topic} = ${propertyValue}`);
        }
        this._mqttClient.publish(topic, String(propertyValue), { retain: true });
    }

    mqttDiscovery(device, roomIdx, Idx) {
        switch (device) {
            case 'light':
                var topic = `homeassistant/light/bestin_wallpad/light_${roomIdx}_${Idx}/config`;
                var payload = {
                    name: `bestin_light_${roomIdx}_${Idx}`,
                    cmd_t: `${this._mqttPrefix}/light/${roomIdx}/${Idx}/command`,
                    stat_t: `${this._mqttPrefix}/light/${roomIdx}/${Idx}/state`,
                    uniq_id: `bestin_light_${roomIdx}_${Idx}`,
                    pl_on: "on",
                    pl_off: "off",
                    device: {
                        ids: "bestin_infancy",
                        name: "bestin_infancy",
                        mf: "HDC BESTIN",
                        mdl: "HDC BESTIN Wallpad",
                        sw: "harwin1/bestin-v1/bestin_infancy",
                    }
                }
                break;
            case 'outlet':
                let component = Idx.includes("usage") ? "sensor" : "switch";
                var topic = `homeassistant/${component}/bestin_wallpad/outlet_${roomIdx}_${Idx}/config`;
                var payload = {
                    name: `bestin_outlet_${roomIdx}_${Idx}`,
                    cmd_t: `${this._mqttPrefix}/outlet/${roomIdx}/${Idx}/command`,
                    stat_t: `${this._mqttPrefix}/outlet/${roomIdx}/${Idx}/state`,
                    uniq_id: `bestin_outlet_${roomIdx}_${Idx}`,
                    pl_on: "on",
                    pl_off: "off",
                    ic: Idx.includes("usage") ? "mdi:lightning-bolt" : "mdi:power-socket-eu",
                    unit_of_meas: Idx.includes("usage") ? "Wh" : "",
                    device: {
                        ids: "bestin_infancy",
                        name: "bestin_infancy",
                        mf: "HDC BESTIN",
                        mdl: "HDC BESTIN Wallpad",
                        sw: "harwin1/bestin-v1/bestin_infancy",
                    }
                }
                break;
            case 'thermostat':
                var topic = `homeassistant/climate/bestin_wallpad/thermostat_${roomIdx}/config`;
                var payload = {
                    name: `bestin_thermostat_${roomIdx}`,
                    mode_cmd_t: `${this._mqttPrefix}/thermostat/${roomIdx}/mode/command`,
                    mode_stat_t: `${this._mqttPrefix}/thermostat/${roomIdx}/mode/state`,
                    temp_cmd_t: `${this._mqttPrefix}/thermostat/${roomIdx}/setting/command`,
                    temp_stat_t: `${this._mqttPrefix}/thermostat/${roomIdx}/setting/state`,
                    curr_temp_t: `${this._mqttPrefix}/thermostat/${roomIdx}/current/state`,
                    uniq_id: `bestin_thermostat_${roomIdx}`,
                    modes: ["off", "heat"],
                    min_temp: 5,
                    max_temp: 40,
                    temp_step: 0.1,
                    device: {
                        ids: "bestin_infancy",
                        name: "bestin_infancy",
                        mf: "HDC BESTIN",
                        mdl: "HDC BESTIN Wallpad",
                        sw: "harwin1/bestin-v1/bestin_infancy",
                    }
                }
                break;
            case 'ventil':
                var topic = `homeassistant/fan/bestin_wallpad/ventil_${roomIdx}/config`;
                var payload = {
                    name: `bestin_ventil_${roomIdx}`,
                    cmd_t: `${this._mqttPrefix}/ventil/${roomIdx}/power/command`,
                    stat_t: `${this._mqttPrefix}/ventil/${roomIdx}/power/state`,
                    pr_mode_cmd_t: `${this._mqttPrefix}/ventil/${roomIdx}/preset/command`,
                    pr_mode_stat_t: `${this._mqttPrefix}/ventil/${roomIdx}/preset/state`,
                    pr_modes: ["01", "02", "03"],
                    uniq_id: `bestin_vnetil_${roomIdx}`,
                    pl_on: "on",
                    pl_off: "off",
                    device: {
                        ids: "bestin_infancy",
                        name: "bestin_infancy",
                        mf: "HDC BESTIN",
                        mdl: "HDC BESTIN Wallpad",
                        sw: "harwin1/bestin-v1/bestin_infancy",
                    }
                }
                break;
            case 'gas':
                var topic = `homeassistant/switch/bestin_wallpad/gas_valve_${roomIdx}/config`;
                var payload = {
                    name: `bestin_gas_valve_${roomIdx}`,
                    cmd_t: `${this._mqttPrefix}/gas/${roomIdx}/power/command`,
                    stat_t: `${this._mqttPrefix}/gas/${roomIdx}/power/state`,
                    uniq_id: `bestin_gas_valve_${roomIdx}`,
                    pl_on: "on",
                    pl_off: "off",
                    ic: "mdi:gas-cylinder",
                    device: {
                        ids: "bestin_infancy",
                        name: "bestin_infancy",
                        mf: "HDC BESTIN",
                        mdl: "HDC BESTIN Wallpad",
                        sw: "harwin1/bestin-v1/bestin_infancy",
                    }
                }
                break;
        }
        this._mqttClient.publish(topic, JSON.stringify(payload), { retain: true });
    }

    // 패킷 체크섬 검증
    verifyCheckSum(packet) {
        // 3으로 초기화
        let result = 0x03;
        for (let i = 0; i < packet.length; i++) {
            result ^= packet[i];
            result = (result + 1) & 0xFF;
            // 바이트를 순차적으로 xor 한뒤 +1 / 8비트로 truncation
        }
        return result;
    }

    // 명령 패킷 마지막 바이트(crc) 생성
    generateCheckSum(packet) {
        let result = 0x03;
        for (let i = 0; i < packet.length - 1; i++) {
            result ^= packet[i];
            result = (result + 1) & 0xFF;
        }
        return result;
    }

    createConnection() {
        if (CONFIG.serial_mode === 'serial') {
            log('intalizing serial...')
            const options = CONFIG.serial;

            this._connection = new SerialPort({
                path: options.port,
                baudRate: options.baudrate,
                dataBits: options.bytesize,
                parity: options.parity,
                stopBits: options.stopbits,
                autoOpen: false,
                encoding: 'hex'
            });

            this._connection.pipe(new CustomParser()).on('data', this.packetHandle.bind(this));
            this._connection.on('open', () => {
                log(`successfully opened port: ${options.port}`);
            });
            this._connection.on('close', () => {
                warn(`closed port: ${options.port}`);
            });
            this._connection.open((err) => {
                if (err) {
                    error(`failed to open port: ${err.message}`);
                }
            });

        } else if (CONFIG.serial_mode === 'socket') {
            log('intalizing socket...')
            const options = CONFIG.socket;

            this._connection = new net.Socket();
            this._connection.connect(options.port, options.address, () => {
                log(`successfully connected to ew11 [${options.address}:${options.port}]`);
            });
            this._connection.on('error', (err) => {
                error(`connection error ${err.code}. try to reconnect...`);
                this._connection.connect(options.port, options.address);
                // 연결 애러 발생시 reconnect
            });
            this._connection.pipe(new CustomParser()).on('data', this.packetHandle.bind(this));
        }
        return this._connection;

    }

    packetHandle(packet) {
        //console.log(packet.toString('hex'));
        if(packet.length === 20) {
            this._timestamp = packet[4];
        }
        this._lastReceive = Date.now();

        const receivedMsg = this._receivedMsgs.find(e => e.codeHex.equals(packet)) || {
            code: packet.toString('hex'),
            codeHex: packet,
            count: 0,
            info: MSG_INFO.filter(e => {
                if (e.device === 'light' || e.device === 'outlet') {    
                    return e.header < packet[1] && e.command == packet[3] && e.length == packet[2];
                } else {
                    return e.header == packet[1] && e.command == packet[2];
                }
            }),
        };
        receivedMsg.checksum = this.verifyCheckSum(packet);
        receivedMsg.count++;
        receivedMsg.lastlastReceive = receivedMsg.lastReceive;
        receivedMsg.lastReceive = this._lastReceive;

        if (Boolean(receivedMsg.checksum) === false) {
            error(`checksum error: ${receivedMsg.code}, ${receivedMsg.codeHex}`);
            return;
        }       
        const PT2Byte = [0x81, 0x82, 0x83];
        const PT3Byte = [0x81, 0x92];
        const foundIdx = this._serialCmdQueue.findIndex(e => e.cmdHex[1] == packet[1] && (PT2Byte.includes(packet[2]) || PT3Byte.includes(packet[3])));
        if (foundIdx > -1) {
            log(`Success command: ${this._serialCmdQueue[foundIdx].device}`);
            const { callback, device } = this._serialCmdQueue[foundIdx];
            if (callback) callback(receivedMsg);
            this._serialCmdQueue.splice(foundIdx, 1);
        }

        for (const msgInfo of receivedMsg.info) {
            if (msgInfo.parseToProperty) {
                const propArray = msgInfo.parseToProperty(packet);
                for (const { device, roomIdx, propertyName, propertyValue } of propArray) {
                    this.updateProperty(device, roomIdx, propertyName, propertyValue, foundIdx > -1);
                }
            }
        }
    }

    addCommandToQueue(cmdHex, device, roomIdx, propertyName, propertyValue, callback) {
        const serialCmd = {
            cmdHex,
            device,
            roomIdx,
            property: propertyName,
            value: propertyValue,
            callback,
            sentTime: new Date(),
            retryCount: CONFIG.rs485.retry_count
        };

        this._serialCmdQueue.push(serialCmd);
        log(`send to device: ${cmdHex.toString('hex')}`);

        const elapsed = serialCmd.sentTime - this._lastReceive;
        const delay = (elapsed < 100) ? 100 - elapsed : 0;

        setTimeout(() => this.processCommand(serialCmd), delay);
    }

    processCommand(serialCmd) {
        if (this._serialCmdQueue.length == 0) {
            return;
        }
        serialCmd = this._serialCmdQueue.shift();

        this._connDevice.write(serialCmd.cmdHex, (err) => {
            if (err) {
                error('Send Error:', err.message);
            }
        });

        if (serialCmd.retryCount > 0) {
            serialCmd.retryCount--;
            this._serialCmdQueue.push(serialCmd);
            setTimeout(() => this.processCommand(serialCmd), CONFIG.rs485.retry_delay);
        } else {
            error(`maximum retries ${CONFIG.rs485.retry_count} times exceeded for command`);
            if (serialCmd.callback) {
                serialCmd.callback.call(this);
            }
        }
    }

    setCommandProperty(device, roomIdx, propertyName, propertyValue, callback) {
        log(`recv. from HA: ${this._mqttPrefix}/${device}/${roomIdx}/${propertyName}/command = ${propertyValue}`);

        const msgInfo = MSG_INFO.find(e => e.setPropertyToMsg && e.device === device);
        if (!msgInfo) {
            warn(`unknown device: ${device}`);
            return;
        }
        if (msgInfo.device === 'gas' && propertyValue === 'on') {
            warn('The gas valve only supports locking');
            return;
        }
        const cmdHex = Buffer.alloc(msgInfo.length);
        const byte2 = msgInfo.length == 10 ? msgInfo.command : msgInfo.length;
        const byte3 = msgInfo.length == 10 ? this._timestamp : msgInfo.command;
        const byte4 = msgInfo.length == 10 ? '' : this._timestamp;

        cmdHex[0] = 0x02;
        cmdHex[1] = msgInfo.header;
        cmdHex[2] = byte2;
        cmdHex[3] = byte3;
        cmdHex[4] = byte4;

        msgInfo.setPropertyToMsg(cmdHex, roomIdx, propertyName, propertyValue);
        cmdHex[msgInfo.length - 1] = this.generateCheckSum(cmdHex);

        this.addCommandToQueue(cmdHex, device, roomIdx, propertyName, propertyValue, callback);
        this.updateProperty(device, roomIdx, propertyName, propertyValue);
    }

    putStatusProperty(device, roomIdx, property) {
        var deviceStatus = {
            device: device,
            roomIdx: roomIdx,
            property: (property ? property : {})
        };
        this._deviceStatus.push(deviceStatus);
        return deviceStatus;
    }

    updateProperty(device, roomIdx, propertyName, propertyValue, force) {
        const propertyKey = device + roomIdx + propertyName;
        const isSamePropertyValue = !force && this._deviceStatusCache[propertyKey] === propertyValue;
        if (isSamePropertyValue) return;

        const isPendingCommand = this._serialCmdQueue.some(e => e.device === device && e.roomIdx === roomIdx && e.property === propertyName && e.value === this._deviceStatusCache[propertyKey]);
        if (isPendingCommand) return;

        this._deviceStatusCache[propertyKey] = propertyValue;

        let deviceStatus = this._deviceStatus.find(o => o.device === device && o.roomIdx === roomIdx);
        if (!deviceStatus) {
            deviceStatus = this.putStatusProperty(device, roomIdx);
        }
        deviceStatus.property[propertyName] = propertyValue;

        this.mqttClientUpdate(device, roomIdx, propertyName, propertyValue);

        let regist = setImmediate(() => {
            if (this._discovery === false) {
                if (CONFIG.mqtt.discovery) { this.mqttDiscovery(device, roomIdx, propertyName) };
            } else {
                return true;
            }
        });
        setTimeout(() => {
            clearImmediate(regist);
            this._discovery = true;
        }, 10000);
    }
}

_rs485 = new rs485();
