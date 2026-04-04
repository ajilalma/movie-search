const fs = require('fs');
const logDir = process.env.LOG_FILE_PATH || './logs';
export const logger = {
    info: (message: string) => {
        fs.appendFileSync(`${logDir}/app.log`, `[LOG] ${JSON.stringify(message)}\n`);
    },
    warn: (message: string) => {
        fs.appendFileSync(`${logDir}/app.log`, `[WARN] ${JSON.stringify(message)}\n`);
    },
    error: (message: string, error?: unknown) => {
        fs.appendFileSync(`${logDir}/app.log`, `[ERROR] ${JSON.stringify(message)}: ${JSON.stringify(error)}\n`);
    },
};
