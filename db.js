const mysql = require('mysql2');

// Railway MySQL connection details
const isProduction = process.env.NODE_ENV === 'production';

console.log('Environment:', process.env.NODE_ENV);
console.log('Is Production:', isProduction);

let pool;

if (isProduction) {
  // Production: Connect to Railway MySQL
  console.log('Connecting to Railway MySQL in production...');
  
  pool = mysql.createPool({
    host: 'turntable.proxy.rlwy.net',
    user: 'root',
    password: 'BoJRYIFIddbxEaJiVCxQVGIoBbgYfvXJ',
    database: 'railway',
    port: 31082,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    ssl: { rejectUnauthorized: false }
  });
} else {
  // Development: Connect to local MySQL
  console.log('Connecting to local MySQL in development...');
  
  pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'monday_clone',
    port: 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });
}

module.exports = pool.promise();

