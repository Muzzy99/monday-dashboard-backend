-- Working Status Table
CREATE TABLE IF NOT EXISTS working_status (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'in-office',
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    disable_notifications BOOLEAN DEFAULT FALSE,
    disable_online_indication BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_status (status),
    INDEX idx_date_range (start_date, end_date)
);

-- Sample data (optional - you can remove this if you don't want sample data)
INSERT INTO working_status (user_id, status, start_date, end_date, disable_notifications, disable_online_indication) VALUES
(1, 'in-office', CURDATE(), CURDATE(), FALSE, FALSE),
(2, 'out-office', CURDATE(), DATE_ADD(CURDATE(), INTERVAL 7 DAY), TRUE, FALSE),
(3, 'working-home', CURDATE(), DATE_ADD(CURDATE(), INTERVAL 3 DAY), FALSE, TRUE); 