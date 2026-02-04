// En producción, el servidor Node.js actúa como proxy inverso.
// Al dejar las URLs vacías o relativas, el navegador usará el mismo host y puerto.

const isProduction = import.meta.env.PROD;

// Si estamos en producción, usamos rutas relativas para que el proxy de Node.js las capture.
// En desarrollo, seguimos usando localhost:8000.
export const API_URL = isProduction 
    ? window.location.origin 
    : "http://localhost:8000";

export const WS_URL = isProduction
    ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`
    : "ws://localhost:8000/ws";
