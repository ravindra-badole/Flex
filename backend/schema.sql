CREATE DATABASE IF NOT EXISTS skillbridge;
USE skillbridge;

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(80) PRIMARY KEY,
  first_name VARCHAR(120) NOT NULL,
  last_name VARCHAR(120) NOT NULL,
  email VARCHAR(200) NOT NULL UNIQUE,
  password_hash VARCHAR(128) NOT NULL,
  role VARCHAR(120) NOT NULL DEFAULT 'Freelancer',
  location VARCHAR(120) NOT NULL DEFAULT 'India',
  skills TEXT NOT NULL,
  about TEXT NOT NULL,
  email_updates TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS gigs (
  id VARCHAR(80) PRIMARY KEY,
  owner_email VARCHAR(200) NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  price DECIMAL(12,2) NOT NULL,
  delivery_days INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_gigs_owner_email (owner_email)
);

CREATE TABLE IF NOT EXISTS jobs (
  id VARCHAR(80) PRIMARY KEY,
  owner_email VARCHAR(200) NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(150) NOT NULL,
  budget DECIMAL(12,2) NOT NULL,
  deadline_days INT NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'Open',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_jobs_owner_email (owner_email),
  INDEX idx_jobs_category (category)
);

CREATE TABLE IF NOT EXISTS applications (
  id VARCHAR(80) PRIMARY KEY,
  job_id VARCHAR(80) NOT NULL,
  client_email VARCHAR(200) NOT NULL,
  freelancer_email VARCHAR(200) NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'Pending',
  applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_job_freelancer (job_id, freelancer_email),
  INDEX idx_apps_client (client_email),
  INDEX idx_apps_freelancer (freelancer_email)
);

CREATE TABLE IF NOT EXISTS support_tickets (
  id VARCHAR(80) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_support_email (email)
);

CREATE TABLE IF NOT EXISTS messages (
  id VARCHAR(80) PRIMARY KEY,
  application_id VARCHAR(80) NULL,
  job_id VARCHAR(80) NULL,
  sender_email VARCHAR(200) NOT NULL,
  recipient_email VARCHAR(200) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_messages_sender (sender_email),
  INDEX idx_messages_recipient (recipient_email),
  INDEX idx_messages_application (application_id)
);
