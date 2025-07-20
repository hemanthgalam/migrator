# SQL to MongoDB Migrator

A web-based tool for migrating data from SQL databases (MySQL, PostgreSQL, SQL Server) to MongoDB collections with customizable column selection and data transformation.

## Features

- **Multi-Database Support**: Connect to MySQL, PostgreSQL, and SQL Server
- **Interactive UI**: Web-based interface for easy migration management
- **Column Selection**: Choose specific columns to migrate
- **Data Preview**: Preview data before migration
- **Custom Collection Names**: Name your MongoDB collections
- **Batch Processing**: Efficient migration with configurable batch sizes
- **WHERE Clause Support**: Filter data during migration
- **Real-time Progress**: Track migration progress
- **Change Data Capture (CDC)**: Real-time polling service for continuous data synchronization
- **Multiple CDC Jobs**: Run multiple polling jobs simultaneously
- **Job Management**: Start, stop, pause, and resume CDC jobs
- **Automatic Upserts**: Handle inserts and updates automatically using primary keys

## Prerequisites

- Node.js (v14 or higher)
- Access to source SQL database
- Access to target MongoDB instance

## Installation

1. Clone or download this project
2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy the environment template:
   ```bash
   copy .env.example .env
   ```

4. Start the application:
   ```bash
   npm start
   ```

5. Open your browser and navigate to `http://localhost:3000`

## Usage

### 1. Connect to Databases

**SQL Database Connection:**
- Select your database type (MySQL, PostgreSQL, SQL Server)
- Enter connection details (host, port, database, username, password)
- Click "Connect to SQL Database"

**MongoDB Connection:**
- Enter MongoDB connection details
- Username/password are optional for local instances
- Click "Connect to MongoDB"

### 2. Configure Migration

**Select Data:**
- Choose a table from the dropdown
- Select columns you want to migrate
- Use "Select All" or "Deselect All" for convenience

**Customize Migration:**
- Enter a name for your MongoDB collection
- Add WHERE clause to filter data (optional)
- Set batch size for processing (default: 1000)

### 3. Preview and Migrate

- Click "Preview Data" to see a sample of your data
- Review the JSON structure that will be created
- Click "Start Migration" to begin the process

### 4. Setup Change Data Capture (CDC)

**Configure Real-time Sync:**
- Select a table for continuous monitoring
- Choose a timestamp column (updated_at, modified_date, etc.)
- Select the primary key column for upsert operations
- Set polling interval (how often to check for changes)
- Configure batch size for processing changes

**Test and Start:**
- Click "Test Configuration" to validate your setup
- Click "Start CDC Job" to begin real-time synchronization
- Monitor active jobs in the CDC dashboard

**Manage CDC Jobs:**
- View all active CDC jobs with statistics
- Pause/Resume jobs as needed
- Stop jobs when no longer needed
- Monitor processing statistics and error counts

## Supported Databases

### SQL Databases
- **MySQL** (5.7+)
- **PostgreSQL** (9.6+)
- **SQL Server** (2012+)

### MongoDB
- **MongoDB** (3.6+)
- Supports both authenticated and non-authenticated instances

## Configuration

### Environment Variables
You can set default connection parameters in the `.env` file, but the UI allows full configuration.

### Batch Processing
- Default batch size: 1000 records
- Adjustable based on your system resources
- Larger batches = faster migration but more memory usage

## Public API Documentation

The application exposes a comprehensive REST API with full Swagger/OpenAPI documentation:

### 📚 API Documentation Access
- **Interactive Swagger UI**: `http://localhost:3000/api-docs`
- **Comprehensive API Guide**: `http://localhost:3000/api-docs.html`
- **API Info Endpoint**: `http://localhost:3000/api`

### 🔗 API Endpoints Overview

#### SQL Database Operations
- `POST /api/sql/connect` - Connect to SQL database (MySQL, PostgreSQL, SQL Server)
- `GET /api/sql/tables/:connectionKey` - List all tables
- `GET /api/sql/columns/:connectionKey/:tableName` - Get table schema
- `POST /api/sql/preview/:connectionKey` - Preview table data
- `POST /api/sql/data/:connectionKey` - Extract full table data
- `DELETE /api/sql/disconnect/:connectionKey` - Close SQL connection

#### MongoDB Operations
- `POST /api/mongo/connect` - Connect to MongoDB
- `GET /api/mongo/test/:connectionKey` - Test MongoDB connection
- `GET /api/mongo/collections/:connectionKey` - List collections
- `POST /api/mongo/insert/:connectionKey` - Insert documents
- `DELETE /api/mongo/disconnect/:connectionKey` - Close MongoDB connection

#### One-time Migration
- `POST /api/migration/migrate` - Perform bulk data migration
- `GET /api/migration/status/:migrationId` - Get migration status

#### Change Data Capture (CDC)
- `POST /api/cdc/start` - Start real-time sync job
- `POST /api/cdc/test` - Test CDC configuration (dry run)
- `GET /api/cdc/jobs` - List all CDC jobs
- `GET /api/cdc/status/:jobId` - Get detailed job status
- `GET /api/cdc/stats/:jobId` - Get job performance statistics
- `POST /api/cdc/pause/:jobId` - Pause CDC job
- `POST /api/cdc/resume/:jobId` - Resume paused job
- `POST /api/cdc/stop/:jobId` - Stop and remove job
- `PUT /api/cdc/update/:jobId` - Update job configuration

### 🚀 API Usage Examples

#### Quick Start with cURL
```bash
# Connect to MySQL
curl -X POST http://localhost:3000/api/sql/connect \
  -H "Content-Type: application/json" \
  -d '{"type":"mysql","host":"localhost","database":"mydb","username":"user","password":"pass"}'

# Start CDC Job
curl -X POST http://localhost:3000/api/cdc/start \
  -H "Content-Type: application/json" \
  -d '{
    "sqlConnectionKey": "mysql-localhost-mydb",
    "mongoConnectionKey": "mongo-localhost-target",
    "tableName": "users",
    "collectionName": "users_sync",
    "timestampColumn": "updated_at",
    "primaryKeyColumn": "id",
    "pollingInterval": 5000
  }'
```

#### JavaScript/Node.js Example
```javascript
const axios = require('axios');

// One-time migration
const migrationResponse = await axios.post('http://localhost:3000/api/migration/migrate', {
  sqlConnectionKey: 'mysql-localhost-mydb',
  mongoConnectionKey: 'mongo-localhost-target',
  tableName: 'products',
  collectionName: 'products',
  selectedColumns: ['id', 'name', 'price', 'category'],
  whereClause: 'active = 1',
  batchSize: 1000
});
```

#### Python Example
```python
import requests

# Test CDC configuration
response = requests.post('http://localhost:3000/api/cdc/test', json={
    'sqlConnectionKey': 'mysql-localhost-mydb',
    'tableName': 'orders',
    'timestampColumn': 'updated_at',
    'primaryKeyColumn': 'id'
})

print(f"CDC Test Result: {response.json()}")
```

## Troubleshooting

### Connection Issues
- Verify database credentials and network connectivity
- Check if databases are running and accessible
- Ensure firewall rules allow connections

### Migration Errors
- Check data types compatibility
- Verify sufficient disk space on MongoDB server
- Monitor memory usage during large migrations

### Performance Tips
- Use WHERE clauses to limit data volume
- Adjust batch size based on available memory
- Consider indexing on MongoDB after migration

## Security Notes

- Never commit actual credentials to version control
- Use environment variables for production deployments
- Consider using connection pooling for high-volume migrations
- Implement proper authentication for production use

## Testing

The application includes a comprehensive test suite using Mocha, Chai, Supertest, and Sinon for thorough testing coverage.

### 🧪 Test Structure

```
test/
├── unit/                   # Unit tests
│   ├── services/          # Service layer tests
│   └── database/          # Database connector tests
├── integration/           # Integration tests
│   ├── api/              # API endpoint tests
│   └── e2e/              # End-to-end workflow tests
├── api/                   # Application-level API tests
├── helpers/               # Test utilities and helpers
└── setup.js              # Global test configuration
```

### 🚀 Running Tests

```bash
# Run all tests
npm test

# Run specific test types
npm run test:unit          # Unit tests only
npm run test:integration   # Integration tests only
npm run test:api          # API tests only

# Run tests with coverage
npm run test:coverage

# Watch mode for development
npm run test:watch

# Custom test runner
node test/run-tests.js [type] [options]
```

### 📊 Test Coverage

The test suite includes:
- **Unit Tests**: Database connectors, CDC service, utilities
- **Integration Tests**: API endpoints, route handlers
- **End-to-End Tests**: Complete workflow scenarios
- **API Tests**: Application-level functionality

Coverage targets:
- Lines: 80%
- Functions: 80%
- Branches: 70%
- Statements: 80%

### 🔧 Test Configuration

Tests use the following tools:
- **Mocha**: Test framework
- **Chai**: Assertion library
- **Supertest**: HTTP assertion library
- **Sinon**: Mocking and stubbing
- **NYC**: Code coverage

### 📝 Writing Tests

Example test structure:
```javascript
const { expect, sinon } = require('chai');
const TestUtils = require('../helpers/testUtils');

describe('Feature Name', () => {
  let stub;

  beforeEach(() => {
    stub = sinon.stub(dependency);
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should perform expected behavior', async () => {
    // Arrange
    const mockData = TestUtils.generateMockData();
    stub.method.resolves(mockData);

    // Act
    const result = await serviceMethod();

    // Assert
    expect(result).to.be.successful;
    expect(stub.method.calledOnce).to.be.true;
  });
});
```

## Development

### Project Structure
```
├── src/
│   ├── app.js              # Main server file
│   ├── config/             # Configuration files
│   │   └── swagger.js      # API documentation config
│   ├── database/           # Database connectors
│   │   ├── sqlConnector.js # SQL database handler
│   │   └── mongoConnector.js # MongoDB handler
│   ├── services/           # Business logic services
│   │   └── cdcService.js   # Change Data Capture service
│   └── routes/             # API routes
│       ├── sql.js          # SQL endpoints
│       ├── mongo.js        # MongoDB endpoints
│       ├── migration.js    # Migration endpoints
│       └── cdc.js          # CDC endpoints
├── public/                 # Frontend files
│   ├── index.html          # Main UI
│   ├── app.js              # Frontend JavaScript
│   ├── styles.css          # Styling
│   └── api-docs.html       # API documentation
├── test/                   # Test suite
│   ├── unit/              # Unit tests
│   ├── integration/       # Integration tests
│   ├── api/               # API tests
│   └── helpers/           # Test utilities
└── package.json            # Dependencies
```

### Running in Development
```bash
npm run dev  # Uses nodemon for auto-restart
```

## 🐳 Docker Deployment

The application is fully containerized with Docker support for both development and production environments.

### 📦 Container Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Nginx Proxy   │    │  Node.js App    │    │   Databases     │
│   (Port 80/443) │────│   (Port 3000)   │────│  MySQL/Postgres │
│   Load Balancer │    │   API Server    │    │   MongoDB       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### 🚀 Quick Start with Docker

#### Development Environment
```bash
# Clone and setup
git clone <repository>
cd sql-to-mongo-migrator

# Start development environment
./scripts/docker-dev.sh start

# View logs
./scripts/docker-dev.sh logs

# Run tests
./scripts/docker-dev.sh test

# Access application shell
./scripts/docker-dev.sh shell

# Stop environment
./scripts/docker-dev.sh stop
```

#### Production Deployment
```bash
# Setup production environment
./scripts/docker-prod.sh deploy

# Create backup
./scripts/docker-prod.sh backup

# View production status
./scripts/docker-prod.sh status

# Scale application
./scripts/docker-prod.sh scale app 3

# Stop production
./scripts/docker-prod.sh stop
```

### 🔧 Docker Services

#### Development Stack (`docker-compose.yml`)
- **Application**: Node.js app with hot reload
- **MySQL**: Sample data and test tables
- **PostgreSQL**: Alternative SQL database
- **MongoDB**: Target database for migrations
- **SQL Server**: Enterprise database support
- **Redis**: Caching layer (optional)
- **Nginx**: Reverse proxy and load balancer

#### Production Stack (`docker-compose.prod.yml`)
- **Application**: Optimized production build
- **MongoDB**: Production-ready with authentication
- **Nginx**: SSL termination and security headers
- **Prometheus**: Metrics collection
- **Grafana**: Monitoring dashboards

### 🌐 Service Endpoints

#### Development
- **Application**: http://localhost:3000
- **API Docs**: http://localhost:3000/api-docs
- **MySQL**: localhost:3306
- **PostgreSQL**: localhost:5432
- **MongoDB**: localhost:27017
- **SQL Server**: localhost:1433
- **Redis**: localhost:6379

#### Production
- **Application**: https://localhost (with SSL)
- **API Docs**: https://localhost/api-docs
- **Grafana**: http://localhost:3001
- **Prometheus**: http://localhost:9090

### ⚙️ Configuration

#### Environment Files
```bash
.env.docker      # Development configuration
.env.production  # Production configuration (customize before deploy)
```

#### Key Configuration Options
```bash
# Application
NODE_ENV=production
PORT=3000

# Database connections
MONGO_HOST=mongodb
MONGO_DATABASE=migration_prod
MONGO_USERNAME=migrator
MONGO_PASSWORD=secure_password

# Security
JWT_SECRET=your_jwt_secret
API_RATE_LIMIT=50
SSL_ENABLED=true

# Monitoring
ENABLE_METRICS=true
GRAFANA_PASSWORD=admin_password
```

### 🔒 Security Features

#### Production Security
- **SSL/TLS encryption** with configurable certificates
- **Rate limiting** on API endpoints
- **Security headers** (HSTS, CSP, XSS protection)
- **Non-root containers** for enhanced security
- **Network isolation** with custom Docker networks
- **Resource limits** to prevent resource exhaustion

#### Database Security
- **Authentication enabled** on all databases
- **Network isolation** between services
- **Encrypted connections** where supported
- **Regular security updates** via base image updates

### 📊 Monitoring & Observability

#### Built-in Monitoring
- **Health checks** for all services
- **Prometheus metrics** collection
- **Grafana dashboards** for visualization
- **Application logs** with structured logging
- **Performance monitoring** with request tracing

#### Log Management
```bash
# View all logs
docker-compose logs -f

# View specific service logs
docker-compose logs -f app

# Production logs with rotation
docker-compose -f docker-compose.prod.yml logs --tail=100 -f
```

### 💾 Backup & Recovery

#### Automated Backups
```bash
# Create backup
./scripts/docker-prod.sh backup

# Restore from backup
./scripts/docker-prod.sh restore backups/prod_20231215_143022
```

#### Backup Contents
- **MongoDB data** with authentication
- **Application logs** for troubleshooting
- **Configuration files** for disaster recovery
- **Metadata** with version and timestamp information

### 🔧 Maintenance

#### Updates
```bash
# Update production environment
./scripts/docker-prod.sh update

# Scale services
./scripts/docker-prod.sh scale app 3

# Health check
./scripts/docker-prod.sh status
```

#### Cleanup
```bash
# Development cleanup
./scripts/docker-dev.sh cleanup

# Remove unused Docker resources
docker system prune -a
```

### 🚨 Troubleshooting

#### Common Issues
```bash
# Check service status
docker-compose ps

# View service logs
docker-compose logs [service_name]

# Restart specific service
docker-compose restart [service_name]

# Rebuild containers
docker-compose up --build

# Check resource usage
docker stats
```

#### Performance Tuning
- **Memory limits** configured per service
- **CPU limits** to prevent resource hogging
- **Connection pooling** for database connections
- **Nginx caching** for static assets
- **MongoDB indexing** for query optimization

### 📋 Docker Commands Reference

#### Development
```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f [service]

# Execute commands in container
docker-compose exec app npm test

# Scale services
docker-compose up -d --scale app=3

# Stop all services
docker-compose down
```

#### Production
```bash
# Deploy production
docker-compose -f docker-compose.prod.yml up -d

# Update services
docker-compose -f docker-compose.prod.yml pull
docker-compose -f docker-compose.prod.yml up -d

# Backup data
docker-compose -f docker-compose.prod.yml exec mongodb mongodump

# Monitor resources
docker stats --no-stream
```

## License

MIT License - feel free to use and modify as needed.