import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config();

const dbHost = process.env.DB_HOST || 'localhost';
const dbUser = process.env.DB_USER || 'u843449532_duvanAponte';
const dbPass = process.env.DB_PASS || 'Duvan1234789149#';
const dbName = process.env.DB_NAME || 'u843449532_andofunnel';
const dbPort = process.env.DB_PORT || 3306;

console.log(`[DB]: Intentando conectar a ${dbName} en ${dbHost}:${dbPort} con usuario ${dbUser}...`);

const sequelize = new Sequelize(dbName, dbUser, dbPass, {
    host: dbHost,
    port: dbPort,
    dialect: 'mysql',
    logging: (msg) => console.log(`[SEQUELIZE]: ${msg}`), // Log de SQL para ver errores reales
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
