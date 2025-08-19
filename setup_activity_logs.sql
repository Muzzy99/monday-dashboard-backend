-- Create activity_logs table for Monday.com style activity tracking
CREATE TABLE IF NOT EXISTS activity_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  task_id INT NOT NULL,
  action_type VARCHAR(50) NOT NULL,
  field_name VARCHAR(50) NOT NULL,
  old_value TEXT,
  new_value TEXT,
  user_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_task_id (task_id),
  INDEX idx_created_at (created_at),
  INDEX idx_action_type (action_type)
);

-- Insert sample activity log data to match the Monday.com style
INSERT INTO activity_logs (task_id, action_type, field_name, old_value, new_value, user_id, created_at) VALUES
(1, 'status_change', 'status', 'Working', 'Stuck', 1, DATE_SUB(NOW(), INTERVAL 10 MINUTE)),
(1, 'date_change', 'date', 'Jul 31', 'Aug 2', 1, DATE_SUB(NOW(), INTERVAL 15 MINUTE)),
(1, 'person_added', 'person', NULL, 'T', 1, DATE_SUB(NOW(), INTERVAL 20 MINUTE)),
(1, 'date_change', 'date', 'Sep 1', 'Jul 31', 1, DATE_SUB(NOW(), INTERVAL 25 MINUTE)),
(2, 'status_change', 'status', 'In Progress', 'Done', 1, DATE_SUB(NOW(), INTERVAL 30 MINUTE)),
(2, 'priority_change', 'priority', 'Low', 'High', 1, DATE_SUB(NOW(), INTERVAL 1 HOUR)),
(3, 'status_change', 'status', 'Pending', 'Working', 1, DATE_SUB(NOW(), INTERVAL 2 HOUR)),
(3, 'person_added', 'person', NULL, 'A', 1, DATE_SUB(NOW(), INTERVAL 3 HOUR)); 