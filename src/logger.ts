import fs from 'fs';
const logDir = process.env.LOG_FILE_PATH || './logs';
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}
if (!fs.existsSync(`${logDir}/app.log`)) {
    fs.writeFileSync(`${logDir}/app.log`, '');
}
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
