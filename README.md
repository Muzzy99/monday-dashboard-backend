# Monday Dashboard Backend

A Node.js/Express backend for the Monday-style dashboard application.

## Features

- User authentication with JWT
- Task management
- File uploads
- Database migrations
- RESTful API endpoints

## Railway Deployment

### Prerequisites

1. Railway account (free)
2. GitHub repository with this code

### Deployment Steps

1. **Go to Railway**: https://railway.app
2. **Sign in** with GitHub
3. **Click "New Project"**
4. **Select "Deploy from GitHub repo"**
5. **Choose repository**: `monday-dashboard-backend`
6. **Railway will auto-detect** Node.js configuration

### Environment Variables

Set these in Railway dashboard:

```
NODE_ENV=production
JWT_SECRET=your_super_secret_jwt_key_2024
PORT=10000
```

### Database Setup

1. **Add MySQL Plugin** in Railway
2. **Connect to your service**
3. **Set database environment variables**:
   ```
   DB_HOST=your_mysql_host
   DB_USER=your_mysql_user
   DB_PASSWORD=your_mysql_password
   DB_NAME=your_database_name
   DB_PORT=3306
   ```

### Run Migrations

After deployment, run migrations to create tables:

```bash
npm run migrate
```

## Local Development

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Set environment variables**:
   ```bash
   cp .env.example .env
   # Edit .env with your database credentials
   ```

3. **Run migrations**:
   ```bash
   npm run migrate
   ```

4. **Start development server**:
   ```bash
   npm run dev
   ```

## API Endpoints

- `GET /api/health` - Health check
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/users` - Get users
- `POST /api/upload` - File upload
- And more...

## Database Schema

The application uses 14 tables:
- users
- workplaces
- tasks
- task_files
- task_updates
- update_comments
- update_likes
- update_reactions
- favorites
- session_history
- user_preferences
- working_status
- activity_logs
- section_order 