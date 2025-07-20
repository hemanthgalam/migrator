-- MySQL initialization script for SQL to MongoDB Migration App
USE migration_test;

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    status ENUM('active', 'inactive') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Create orders table
CREATE TABLE IF NOT EXISTS orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    total DECIMAL(10, 2) NOT NULL,
    status ENUM('pending', 'completed', 'cancelled') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Create products table
CREATE TABLE IF NOT EXISTS products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10, 2) NOT NULL,
    category VARCHAR(100),
    stock_quantity INT DEFAULT 0,
    status ENUM('active', 'inactive') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Insert sample data
INSERT INTO users (name, email, status) VALUES
('John Doe', 'john.doe@example.com', 'active'),
('Jane Smith', 'jane.smith@example.com', 'active'),
('Bob Johnson', 'bob.johnson@example.com', 'inactive'),
('Alice Brown', 'alice.brown@example.com', 'active'),
('Charlie Wilson', 'charlie.wilson@example.com', 'active');

INSERT INTO products (name, description, price, category, stock_quantity) VALUES
('Laptop', 'High-performance laptop', 999.99, 'Electronics', 50),
('Mouse', 'Wireless optical mouse', 29.99, 'Electronics', 100),
('Keyboard', 'Mechanical keyboard', 79.99, 'Electronics', 75),
('Monitor', '24-inch LED monitor', 199.99, 'Electronics', 30),
('Headphones', 'Noise-cancelling headphones', 149.99, 'Electronics', 25);

INSERT INTO orders (user_id, total, status) VALUES
(1, 999.99, 'completed'),
(2, 29.99, 'completed'),
(1, 79.99, 'pending'),
(3, 199.99, 'cancelled'),
(4, 149.99, 'completed'),
(5, 109.98, 'pending');

-- Create indexes for better performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_updated_at ON users(updated_at);
CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_updated_at ON orders(updated_at);
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_status ON products(status);
CREATE INDEX idx_products_updated_at ON products(updated_at);