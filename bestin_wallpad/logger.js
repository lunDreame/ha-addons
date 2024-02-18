const winston = require('winston');
const { combine, timestamp, printf } = winston.format;
const options = require('/data/options.json');

const format = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(
        (info) => `${info.timestamp} ${info.level.toUpperCase()}  ${info.message}`,
    ),
)

const fileTransport = new winston.transports.File({
    filename: `./logs/${new Date().toISOString().slice(0, 10)}.log`,
    maxFiles: 7,
    maxsize: 1024 * 1024 * 10,
    tailable: true,
});

const logger = winston.createLogger({
    level: options.log.debug_mode ? 'silly' : 'info',
    format: combine(timestamp(), format),
    transports: [
        new winston.transports.Console(),
    ],
});

const filter = winston.format((info, opts) => {
    if (info.message.includes("SERIAL")) {
        if (options.rs485.dump_log) {
            info.message = info.message.replace("SERIAL", "");
            return info;
        } else {
            return false;
        }
    }
    return info;
});

logger.add(filter());

if (options.log.to_file) {
    logger.add(fileTransport);
}

module.exports = logger;
