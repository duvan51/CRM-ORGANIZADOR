import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config();

const dbHost = process.env.DB_HOST || 'localhost';
const dbUser = process.env.DB_USER || 'root';
const dbPass = process.env.DB_PASS || '';
const dbName = process.env.DB_NAME || 'agenda_db';
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
