#!/bin/bash

# Docker Production Environment Management Script
# SQL to MongoDB Migration App

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if Docker is running
check_docker() {
    if ! docker info > /dev/null 2>&1; then
        print_error "Docker is not running. Please start Docker and try again."
        exit 1
    fi
}

# Function to check if Docker Compose is available
check_docker_compose() {
    if ! command -v docker-compose > /dev/null 2>&1; then
        print_error "Docker Compose is not installed. Please install Docker Compose and try again."
        exit 1
    fi
}

# Function to validate production environment
validate_production_env() {
    print_status "Validating production environment..."
    
    if [ ! -f .env.production ]; then
        print_error ".env.production file not found. Please create it from .env.production template."
        exit 1
    fi
    
    # Check for default passwords
    if grep -q "CHANGE_THIS" .env.production; then
        print_error "Default passwords found in .env.production. Please change all default passwords before deploying to production."
        exit 1
    fi
    
    # Check for SSL certificates
    if [ ! -f docker/nginx/ssl/cert.pem ] || [ ! -f docker/nginx/ssl/key.pem ]; then
        print_warning "SSL certificates not found. HTTPS will not work properly."
        print_status "Please place your SSL certificates in docker/nginx/ssl/"
        read -p "Continue anyway? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
    
    print_success "Production environment validation completed!"
}

# Function to generate SSL certificates (self-signed for testing)
generate_ssl_certs() {
    print_status "Generating self-signed SSL certificates for testing..."
    
    mkdir -p docker/nginx/ssl
    
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout docker/nginx/ssl/key.pem \
        -out docker/nginx/ssl/cert.pem \
        -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"
    
    print_success "Self-signed SSL certificates generated!"
    print_warning "These are self-signed certificates for testing only. Use proper certificates in production."
}

# Function to deploy production environment
deploy() {
    print_status "Deploying production environment..."
    
    validate_production_env
    
    # Copy production environment file
    cp .env.production .env
    
    # Build and deploy
    docker-compose -f docker-compose.prod.yml up --build -d
    
    # Wait for services to be ready
    print_status "Waiting for services to be ready..."
    sleep 30
    
    # Health check
    if curl -f -s http://localhost/health > /dev/null; then
        print_success "Production environment deployed successfully!"
        print_status "Services available at:"
        echo "  - Application: https://localhost (HTTP redirects to HTTPS)"
        echo "  - API Documentation: https://localhost/api-docs"
        echo "  - Monitoring: http://localhost:3001 (Grafana)"
        echo "  - Metrics: http://localhost:9090 (Prometheus)"
    else
        print_error "Health check failed. Please check the logs."
        docker-compose -f docker-compose.prod.yml logs
        exit 1
    fi
}

# Function to stop production environment
stop() {
    print_status "Stopping production environment..."
    docker-compose -f docker-compose.prod.yml down
    print_success "Production environment stopped!"
}

# Function to update production environment
update() {
    print_status "Updating production environment..."
    
    # Pull latest images
    docker-compose -f docker-compose.prod.yml pull
    
    # Rebuild and restart
    docker-compose -f docker-compose.prod.yml up --build -d
    
    print_success "Production environment updated!"
}

# Function to backup production data
backup() {
    print_status "Creating production backup..."
    
    # Create backup directory with timestamp
    BACKUP_DIR="backups/prod_$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$BACKUP_DIR"
    
    # Backup MongoDB
    print_status "Backing up MongoDB..."
    docker-compose -f docker-compose.prod.yml exec -T mongodb mongodump --authenticationDatabase admin -u admin -p "$MONGO_ROOT_PASSWORD" --db migration_prod --archive > "$BACKUP_DIR/mongodb_backup.archive"
    
    # Backup application logs
    print_status "Backing up application logs..."
    docker-compose -f docker-compose.prod.yml logs > "$BACKUP_DIR/application_logs.txt"
    
    # Create backup metadata
    cat > "$BACKUP_DIR/backup_info.txt" << EOF
Backup created: $(date)
Environment: Production
MongoDB Database: migration_prod
Application Version: $(docker-compose -f docker-compose.prod.yml exec -T app node -e "console.log(require('./package.json').version)")
EOF
    
    print_success "Production backup created in $BACKUP_DIR"
}

# Function to restore production data
restore() {
    if [ -z "$1" ]; then
        print_error "Please specify backup directory to restore from."
        echo "Usage: $0 restore <backup_directory>"
        exit 1
    fi
    
    BACKUP_DIR="$1"
    
    if [ ! -d "$BACKUP_DIR" ]; then
        print_error "Backup directory $BACKUP_DIR not found."
        exit 1
    fi
    
    print_warning "This will restore production data from $BACKUP_DIR"
    print_warning "Current data will be overwritten!"
    read -p "Are you sure? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_status "Restore cancelled."
        exit 0
    fi
    
    print_status "Restoring production data from $BACKUP_DIR..."
    
    # Restore MongoDB
    if [ -f "$BACKUP_DIR/mongodb_backup.archive" ]; then
        print_status "Restoring MongoDB..."
        docker-compose -f docker-compose.prod.yml exec -T mongodb mongorestore --authenticationDatabase admin -u admin -p "$MONGO_ROOT_PASSWORD" --db migration_prod --archive < "$BACKUP_DIR/mongodb_backup.archive"
    fi
    
    print_success "Production data restored from $BACKUP_DIR"
}

# Function to view production logs
logs() {
    if [ -z "$1" ]; then
        docker-compose -f docker-compose.prod.yml logs -f
    else
        docker-compose -f docker-compose.prod.yml logs -f "$1"
    fi
}

# Function to show production status
status() {
    print_status "Production environment status:"
    docker-compose -f docker-compose.prod.yml ps
    echo ""
    
    print_status "Resource usage:"
    docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}\t{{.BlockIO}}"
    echo ""
    
    print_status "Health checks:"
    if curl -f -s http://localhost/health > /dev/null; then
        print_success "Application: Healthy"
    else
        print_error "Application: Unhealthy"
    fi
}

# Function to scale services
scale() {
    if [ -z "$1" ] || [ -z "$2" ]; then
        print_error "Please specify service and number of replicas."
        echo "Usage: $0 scale <service> <replicas>"
        exit 1
    fi
    
    print_status "Scaling $1 to $2 replicas..."
    docker-compose -f docker-compose.prod.yml up -d --scale "$1=$2"
    print_success "Service $1 scaled to $2 replicas!"
}

# Function to show help
show_help() {
    echo "SQL to MongoDB Migration App - Docker Production Script"
    echo ""
    echo "Usage: $0 [COMMAND] [OPTIONS]"
    echo ""
    echo "Commands:"
    echo "  deploy        Deploy production environment"
    echo "  stop          Stop production environment"
    echo "  update        Update production environment"
    echo "  backup        Create production backup"
    echo "  restore       Restore from backup"
    echo "  logs          View production logs (optionally specify service)"
    echo "  status        Show production status and health"
    echo "  scale         Scale a service (e.g., scale app 3)"
    echo "  ssl-certs     Generate self-signed SSL certificates"
    echo "  help          Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 deploy"
    echo "  $0 backup"
    echo "  $0 restore backups/prod_20231215_143022"
    echo "  $0 logs app"
    echo "  $0 scale app 3"
}

# Main script logic
main() {
    check_docker
    check_docker_compose
    
    case "${1:-help}" in
        deploy)
            deploy
            ;;
        stop)
            stop
            ;;
        update)
            update
            ;;
        backup)
            backup
            ;;
        restore)
            restore "$2"
            ;;
        logs)
            logs "$2"
            ;;
        status)
            status
            ;;
        scale)
            scale "$2" "$3"
            ;;
        ssl-certs)
            generate_ssl_certs
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            print_error "Unknown command: $1"
            show_help
            exit 1
            ;;
    esac
}

# Run main function with all arguments
main "$@"