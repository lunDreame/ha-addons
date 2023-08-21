const winston = require('winston');
const { combine, timestamp, printf } = winston.format;
const { to_file, level } = require('/data/options.json').log;

/** Log Output Format */ 
const format = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(
        (info) => `${info.timestamp} ${info.level.toUpperCase()}  ${info.message}`,
    ),
)

/** File Save Settings */
const fileTransport = new winston.transports.File({
    filename: `./logs/${new Date().toISOString().slice(0, 10)}.log`,
    maxFiles: 7,
    maxsize: 1024 * 1024 * 10,
    tailable: true,
});

/** Settings by Log Level */
const logger = winston.createLogger({
    level: level,
    format: combine(timestamp(), format),
    transports: [
        new winston.transports.Console(),
    ],
});

/** Add file save settings when to_file is true */
if (to_file) {
    logger.add(fileTransport);
}

/** File storage settings based on log level */
switch (level) {
    case 'silly':
        fileTransport.level = 'silly';
        break;
    case 'info':
        fileTransport.level = 'info';
        break;
    case 'error':
        fileTransport.level = 'error';
        break;
    case 'warn':
        fileTransport.level = 'warn';
        break;
    case 'debug':
        fileTransport.level = 'debug';
        break;
}

module.exports = logger;
