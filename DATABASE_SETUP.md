# OneAI Database Setup Guide

This guide helps you set up PostgreSQL database for the OneAI application.

## Quick Setup (Automated)

Run the automated setup script:

```bash
./scripts/setup-database.sh
```

This script will:
- Start PostgreSQL service if not running
- Create the database and user
- Generate .env configuration file
- Install npm dependencies
- Initialize database tables
- Create test user account

## Manual Setup

If you prefer to set up manually or the automated script doesn't work:

### 1. Install PostgreSQL

```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install postgresql postgresql-contrib

# macOS
brew install postgresql
```

### 2. Start PostgreSQL Service

```bash
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

### 3. Create Database and User

```bash
# Switch to postgres user and create database/user
sudo -u postgres psql -c "CREATE USER oneai WITH PASSWORD 'oneai123';"
sudo -u postgres createdb -O oneai oneai
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE oneai TO oneai;"
```

### 4. Test Connection

```bash
PGPASSWORD=oneai123 psql -h localhost -U oneai -d oneai -c "SELECT NOW();"
```

### 5. Create .env File

Create a `.env` file in the project root:

```env
# Database Configuration
DB_HOST=localhost
DB_USER=oneai
DB_PASSWORD=oneai123
DB_NAME=oneai
DB_PORT=5432

# Application Configuration
NODE_ENV=development
PORT=3000

# Session and JWT Secrets
SESSION_SECRET=oneai_dev_session_secret_2024
JWT_SECRET=oneai_dev_jwt_secret_2024

# OAuth Configuration (placeholder values for development)
GOOGLE_CLIENT_ID=development_client_id
GOOGLE_CLIENT_SECRET=development_client_secret

# Apple OAuth Configuration (placeholder values for development)
APPLE_CLIENT_ID=development_apple_client_id
APPLE_TEAM_ID=development_apple_team_id
APPLE_KEY_ID=development_apple_key_id
APPLE_KEY_PATH=/tmp/development_apple_key.p8
```

### 6. Install Dependencies and Initialize Database

```bash
npm install
npm run db:create
```

### 7. Start the Application

```bash
npm start
```

## Troubleshooting

### Common Connection Errors

#### Error: `ECONNREFUSED ::1:5432` or `ECONNREFUSED 127.0.0.1:5432`

**Solution:**
1. Check if PostgreSQL service is running: `sudo systemctl status postgresql`
2. Start PostgreSQL if not running: `sudo systemctl start postgresql`
3. Verify the service is listening on port 5432: `sudo netstat -plnt | grep :5432`

#### Error: `password authentication failed for user "oneai"`

**Solution:**
1. Verify the user exists: `sudo -u postgres psql -c "\du"`
2. Reset password if needed: `sudo -u postgres psql -c "ALTER USER oneai PASSWORD 'oneai123';"`
3. Check your .env file has correct credentials

#### Error: `database "oneai" does not exist`

**Solution:**
1. Create the database: `sudo -u postgres createdb -O oneai oneai`
2. Verify database exists: `sudo -u postgres psql -l | grep oneai`

#### Error: `permission denied for schema public`

**Solution:**
```bash
sudo -u postgres psql -d oneai -c "GRANT ALL ON SCHEMA public TO oneai;"
sudo -u postgres psql -d oneai -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO oneai;"
sudo -u postgres psql -d oneai -c "GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO oneai;"
```

### Environment Variables

Make sure your `.env` file contains all required variables:
- `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_PORT`
- `NODE_ENV`, `PORT`
- `SESSION_SECRET`, `JWT_SECRET`
- OAuth credentials (can be placeholder values for development)

### Test Account

Once setup is complete, you can login with:
- **Email:** test@oneai.com
- **Password:** test1234

## Development vs Production

### Development
- Uses localhost PostgreSQL
- Creates test user automatically
- Placeholder OAuth credentials
- HTTP connections

### Production
- Use environment variables for all sensitive data
- Set up proper OAuth applications
- Use SSL/TLS connections
- Set `NODE_ENV=production`

## Database Schema

The application creates the following tables:
- `users` - User accounts and profiles
- `user_ai_engines` - User's connected AI services
- `sharings` - AI service sharing groups
- `sharing_participants` - Sharing group members
- `posts` - Community posts
- `comments` - Post comments
- `likes` - Post and comment likes
- `notifications` - User notifications
- `files` - File uploads
- `user_sessions` - User sessions
- `audit_logs` - Security audit logs
- `oauth_accounts` - Social login accounts
- `payment_history` - Payment transactions
- `user_settings` - User preferences

## Support

If you encounter issues:
1. Check the troubleshooting section above
2. Verify all prerequisites are installed
3. Check the application logs for specific error messages
4. Ensure all environment variables are properly set