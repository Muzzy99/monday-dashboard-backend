const mysql = require('mysql2');

// Use Railway's DATABASE_URL if available, otherwise fall back to individual variables
const databaseUrl = process.env.DATABASE_URL;

console.log('Database URL:', databaseUrl);
console.log('NODE_ENV:', process.env.NODE_ENV);

let pool;

if (databaseUrl) {
  // Parse Railway's DATABASE_URL
  const url = new URL(databaseUrl);
  console.log('Connecting to Railway MySQL:', {
    host: url.hostname,
    user: url.username,
    database: url.pathname.substring(1),
    port: url.port || 3306
  });
  
  pool = mysql.createPool({
    host: url.hostname,
    user: url.username,
    password: url.password,
    database: url.pathname.substring(1), // Remove leading slash
    port: url.port || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });
} else {
  // Fall back to individual environment variables
  console.log('Connecting with individual environment variables:', {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    database: process.env.DB_NAME || 'monday_clone',
    port: process.env.DB_PORT || 3306
  });
  
  pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'monday_clone',
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });
}

module.exports = pool.promise();

