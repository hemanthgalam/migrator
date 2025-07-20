#!/bin/bash

# Docker Development Environment Management Script
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

# Function to start development environment
start_dev() {
    print_status "Starting development environment..."
    
    # Copy environment file
    if [ ! -f .env ]; then
        cp .env.docker .env
        print_status "Created .env file from .env.docker template"
    fi
    
    # Build and start services
    docker-compose up --build -d
    
    print_success "Development environment started!"
    print_status "Services available at:"
    echo "  - Application: http://localhost:3000"
    echo "  - API Documentation: http://localhost:3000/api-docs"
    echo "  - MySQL: localhost:3306"
    echo "  - PostgreSQL: localhost:5432"
    echo "  - MongoDB: localhost:27017"
    echo "  - SQL Server: localhost:1433"
    echo "  - Redis: localhost:6379"
    echo ""
    print_status "Use 'docker-compose logs -f' to view logs"
}

# Function to stop development environment
stop_dev() {
    print_status "Stopping development environment..."
    docker-compose down
    print_success "Development environment stopped!"
}

# Function to restart development environment
restart_dev() {
    print_status "Restarting development environment..."
    docker-compose restart
    print_success "Development environment restarted!"
}

# Function to view logs
logs() {
    if [ -z "$1" ]; then
        docker-compose logs -f
    else
        docker-compose logs -f "$1"
    fi
}

# Function to run tests in container
test() {
    print_status "Running tests in container..."
    docker-compose exec app npm test
}

# Function to access application shell
shell() {
    print_status "Accessing application shell..."
    docker-compose exec app sh
}

# Function to clean up Docker resources
cleanup() {
    print_warning "This will remove all containers, networks, and volumes for this project."
    read -p "Are you sure? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_status "Cleaning up Docker resources..."
        docker-compose down -v --remove-orphans
        docker system prune -f
        print_success "Cleanup completed!"
    else
        print_status "Cleanup cancelled."
    fi
}

# Function to show status
status() {
    print_status "Docker containers status:"
    docker-compose ps
    echo ""
    print_status "Docker images:"
    docker images | grep -E "(sql-mongo-migrator|mysql|postgres|mongo)"
    echo ""
    print_status "Docker volumes:"
    docker volume ls | grep -E "(sql-mongo-migrator|mysql|postgres|mongo)"
}

# Function to backup databases
backup() {
    print_status "Creating database backups..."
    
    # Create backup directory
    mkdir -p backups/$(date +%Y%m%d)
    
    # Backup MySQL
    print_status "Backing up MySQL..."
    docker-compose exec mysql mysqldump -u testuser -ptestpass migration_test > backups/$(date +%Y%m%d)/mysql_backup.sql
    
    # Backup PostgreSQL
    print_status "Backing up PostgreSQL..."
    docker-compose exec postgres pg_dump -U testuser migration_test > backups/$(date +%Y%m%d)/postgres_backup.sql
    
    # Backup MongoDB
    print_status "Backing up MongoDB..."
    docker-compose exec mongodb mongodump --db migration_test --out /tmp/mongo_backup
    docker cp $(docker-compose ps -q mongodb):/tmp/mongo_backup backups/$(date +%Y%m%d)/
    
    print_success "Database backups created in backups/$(date +%Y%m%d)/"
}

# Function to show help
show_help() {
    echo "SQL to MongoDB Migration App - Docker Development Script"
    echo ""
    echo "Usage: $0 [COMMAND]"
    echo ""
    echo "Commands:"
    echo "  start     Start the development environment"
    echo "  stop      Stop the development environment"
    echo "  restart   Restart the development environment"
    echo "  logs      View logs (optionally specify service name)"
    echo "  test      Run tests in container"
    echo "  shell     Access application shell"
    echo "  status    Show status of containers and resources"
    echo "  backup    Create database backups"
    echo "  cleanup   Remove all containers, networks, and volumes"
    echo "  help      Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 start"
    echo "  $0 logs app"
    echo "  $0 test"
    echo "  $0 shell"
}

# Main script logic
main() {
    check_docker
    check_docker_compose
    
    case "${1:-help}" in
        start)
            start_dev
            ;;
        stop)
            stop_dev
            ;;
        restart)
            restart_dev
            ;;
        logs)
            logs "$2"
            ;;
        test)
            test
            ;;
        shell)
            shell
            ;;
        status)
            status
            ;;
        backup)
            backup
            ;;
        cleanup)
            cleanup
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