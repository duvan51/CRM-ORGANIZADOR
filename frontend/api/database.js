import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config();

const dbHost = process.env.DB_HOST || '127.0.0.1';
const dbUser = process.env.DB_USER || 'u843449532_duvanAponte';
const dbPass = process.env.DB_PASS || 'Duvan1234789149#';
const dbName = process.env.DB_NAME || 'u843449532_andofunnel';
const dbPort = process.env.DB_PORT || 3306;

console.log('----------------------------------------------------');
console.log('[DEBUG-DB]: INICIANDO CONFIGURACIÓN DE SEQUELIZE');
console.log(`[DEBUG-DB]: DB_NAME: ${dbName}`);
console.log(`[DEBUG-DB]: DB_USER: ${dbUser}`);
console.log(`[DEBUG-DB]: DB_HOST: ${dbHost}`);
console.log(`[DEBUG-DB]: DB_PORT: ${dbPort}`);
console.log('----------------------------------------------------');

const sequelize = new Sequelize(dbName, dbUser, dbPass, {
    host: dbHost,
    port: dbPort,
    dialect: 'mysql',
    logging: (msg) => console.log(`[SQL-LOG]: ${msg}`),
    pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000
    },
    define: {
        timestamps: false
    }
});

export default sequelize;
