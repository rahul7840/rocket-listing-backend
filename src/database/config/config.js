require('dotenv').config();

const base = {
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_NAME ?? 'rocket listing',
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  dialect: 'postgres',
};

module.exports = {
  development: base,
  test: base,
  production: base,
};
