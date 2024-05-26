const winston = require("winston");
const { combine, timestamp, printf } = winston.format;
const { to_file, debug_mode } = require("/data/options.json").log;

const format = combine(
    timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    printf(
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
    level: (debug_mode ? "silly" : "info"),
    format: combine(timestamp(), format),
    transports: [
        new winston.transports.Console(),
    ],
});

if (to_file) {
    logger.add(fileTransport);
}

module.exports = logger;
