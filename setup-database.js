const mysql = require('mysql2');
const fs = require('fs');
const path = require('path');

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'monday_clone',
  port: process.env.DB_PORT || 3306,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
};

// Create connection
const connection = mysql.createConnection(dbConfig);

async function runMigrations() {
  try {
    console.log('Connecting to database...');
    
    // Test connection
    await new Promise((resolve, reject) => {
      connection.connect((err) => {
        if (err) {
          console.error('Error connecting to database:', err);
          reject(err);
        } else {
          console.log('✅ Connected to database successfully!');
          resolve();
        }
      });
    });

    // Get all migration files
    const migrationsDir = path.join(__dirname, 'migrations');
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort(); // This will sort them numerically

    console.log(`\nFound ${migrationFiles.length} migration files`);

    // Run each migration
    for (let i = 0; i < migrationFiles.length; i++) {
      const migrationFile = migrationFiles[i];
      const migrationPath = path.join(migrationsDir, migrationFile);
      const sql = fs.readFileSync(migrationPath, 'utf8');
      
      console.log(`\nRunning migration: ${migrationFile}`);
      
      await new Promise((resolve, reject) => {
        connection.query(sql, (err, result) => {
          if (err) {
            console.error(`❌ Error running migration ${migrationFile}:`, err);
            reject(err);
          } else {
            console.log(`✅ Migration ${migrationFile} completed successfully`);
            resolve(result);
          }
        });
      });
    }

    console.log('\n🎉 All migrations completed successfully!');
    console.log('\nYour database is now ready with all tables created.');

  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    connection.end();
  }
}

// Run the migrations
runMigrations(); 