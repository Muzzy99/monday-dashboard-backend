-- User Preferences Table for Language & Region Settings
CREATE TABLE IF NOT EXISTS user_preferences (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    language VARCHAR(10) DEFAULT 'en',
    timezone VARCHAR(50) DEFAULT 'UTC',
    time_format ENUM('12h', '24h') DEFAULT '12h',
    date_format ENUM('MMM DD, YYYY', 'DD MMM, YYYY') DEFAULT 'MMM DD, YYYY',
    first_day_of_week ENUM('sunday', 'monday') DEFAULT 'monday',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_preferences (user_id),
    INDEX idx_user_id (user_id)
); 