-- Session History Table
CREATE TABLE IF NOT EXISTS session_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    session_token VARCHAR(255) NOT NULL,
    device VARCHAR(100) DEFAULT 'Unknown Device',
    browser VARCHAR(100) DEFAULT 'Unknown Browser',
    location VARCHAR(200) DEFAULT 'Unknown Location',
    ip_address VARCHAR(45) NOT NULL,
    user_agent TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_session_token (session_token),
    INDEX idx_is_active (is_active),
    INDEX idx_last_activity (last_activity)
); 